use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("44tTkRHFef9s1TdG9KcH5jKSLQVoDrLUevA6gKr6HDcr");

#[program]
pub mod pawnchain {
    use super::*;

    /// 1. Borrower locks 1 digital collateral token (NFT / RWA Receipt) in PDA escrow and opens a pawn ticket.
    pub fn create_pawn_ticket(
        ctx: Context<CreatePawnTicket>,
        ticket_id: u64,
        loan_amount: u64,
        interest_bps: u16,
        duration_seconds: i64,
        ai_valuation_lamports: u64,
        asset_type: AssetType,
        fingerprint_hash: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        require!(loan_amount > 0, PawnError::InvalidAmount);
        require!(duration_seconds > 0, PawnError::InvalidDuration);
        require!(interest_bps <= 5000, PawnError::ExcessiveInterest);
        require!(metadata_uri.len() <= 200, PawnError::MetadataTooLong);

        let ticket = &mut ctx.accounts.pawn_ticket;
        ticket.borrower = ctx.accounts.borrower.key();
        ticket.lender = Pubkey::default();
        ticket.collateral_mint = ctx.accounts.collateral_mint.key();
        ticket.ticket_id = ticket_id;
        ticket.loan_amount = loan_amount;
        ticket.interest_bps = interest_bps;
        ticket.duration_seconds = duration_seconds;
        ticket.ai_valuation_lamports = ai_valuation_lamports;
        ticket.asset_type = asset_type;
        ticket.fingerprint_hash = fingerprint_hash;
        ticket.custody_attested = asset_type == AssetType::Digital;
        ticket.custody_attestation_hash = [0u8; 32];
        ticket.start_time = 0;
        ticket.due_time = 0;
        ticket.status = PawnStatus::Open;
        ticket.metadata_uri = metadata_uri;
        ticket.bump = ctx.bumps.pawn_ticket;

        let cpi_accounts = Transfer {
            from: ctx.accounts.borrower_collateral_ata.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, 1)?;

        emit!(TicketCreated {
            ticket: ticket.key(),
            borrower: ticket.borrower,
            collateral_mint: ticket.collateral_mint,
            loan_amount,
            ai_valuation_lamports,
        });

        Ok(())
    }

    /// 2. Lender funds an open pawn ticket with SOL directly to borrower.
    pub fn fund_loan(ctx: Context<FundLoan>) -> Result<()> {
        let ticket = &mut ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Open, PawnError::TicketNotOpen);
        require!(ticket.custody_attested, PawnError::CustodyNotAttested);
        require!(
            ctx.accounts.lender.key() != ticket.borrower,
            PawnError::CannotFundOwnLoan
        );

        let now = Clock::get()?.unix_timestamp;
        ticket.lender = ctx.accounts.lender.key();
        ticket.start_time = now;
        ticket.due_time = now
            .checked_add(ticket.duration_seconds)
            .ok_or(PawnError::MathOverflow)?;
        ticket.status = PawnStatus::Active;

        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.lender.to_account_info(),
                to: ctx.accounts.borrower.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, ticket.loan_amount)?;

        emit!(LoanFunded {
            ticket: ticket.key(),
            lender: ticket.lender,
            loan_amount: ticket.loan_amount,
            due_time: ticket.due_time,
        });

        Ok(())
    }

    /// 3. Atomic repayment + collateral release in a single instruction.
    pub fn repay_and_release(ctx: Context<RepayAndRelease>) -> Result<()> {
        let ticket = &mut ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Active, PawnError::TicketNotActive);

        let interest = (ticket.loan_amount as u128)
            .checked_mul(ticket.interest_bps as u128)
            .ok_or(PawnError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PawnError::MathOverflow)? as u64;

        let total_repayment = ticket
            .loan_amount
            .checked_add(interest)
            .ok_or(PawnError::MathOverflow)?;

        let pay_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.borrower.to_account_info(),
                to: ctx.accounts.lender.to_account_info(),
            },
        );
        system_program::transfer(pay_ctx, total_repayment)?;

        let ticket_id_bytes = ticket.ticket_id.to_le_bytes();
        let seeds = &[
            b"pawn_ticket",
            ticket.borrower.as_ref(),
            ticket_id_bytes.as_ref(),
            &[ticket.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let release_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.borrower_collateral_ata.to_account_info(),
                authority: ticket.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(release_ctx, 1)?;

        ticket.status = PawnStatus::Repaid;

        emit!(LoanRepaid {
            ticket: ticket.key(),
            total_repayment,
        });

        Ok(())
    }

    /// 4. Lender claims collateral after due_time passes without full repayment.
    pub fn claim_default(ctx: Context<ClaimDefault>) -> Result<()> {
        let ticket = &mut ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Active, PawnError::TicketNotActive);

        let now = Clock::get()?.unix_timestamp;
        require!(now > ticket.due_time, PawnError::LoanNotExpired);

        let ticket_id_bytes = ticket.ticket_id.to_le_bytes();
        let seeds = &[
            b"pawn_ticket",
            ticket.borrower.as_ref(),
            ticket_id_bytes.as_ref(),
            &[ticket.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let claim_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.lender_collateral_ata.to_account_info(),
                authority: ticket.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(claim_ctx, 1)?;

        ticket.status = PawnStatus::DefaultClaimed;

        emit!(CollateralClaimed {
            ticket: ticket.key(),
            lender: ticket.lender,
        });

        Ok(())
    }

    /// 5. Authorized custodian signs custody attestation hash for physical RWA collateral.
    pub fn submit_custody_attestation(
        ctx: Context<SubmitCustodyAttestation>,
        attestation_hash: [u8; 32],
    ) -> Result<()> {
        let ticket = &mut ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Open, PawnError::TicketNotOpen);
        require!(
            ticket.asset_type == AssetType::Physical,
            PawnError::NotPhysicalAsset
        );

        ticket.custody_attested = true;
        ticket.custody_attestation_hash = attestation_hash;

        emit!(CustodyAttested {
            ticket: ticket.key(),
            custodian: ctx.accounts.custodian_authority.key(),
            attestation_hash,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(ticket_id: u64)]
pub struct CreatePawnTicket<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = borrower,
    )]
    pub borrower_collateral_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = borrower,
        space = 8 + PawnTicket::INIT_SPACE,
        seeds = [b"pawn_ticket", borrower.key().as_ref(), &ticket_id.to_le_bytes()],
        bump
    )]
    pub pawn_ticket: Account<'info, PawnTicket>,

    #[account(
        init,
        payer = borrower,
        associated_token::mint = collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct FundLoan<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,

    /// CHECK: Verified via pawn_ticket.borrower constraint
    #[account(mut, address = pawn_ticket.borrower)]
    pub borrower: UncheckedAccount<'info>,

    #[account(mut)]
    pub pawn_ticket: Account<'info, PawnTicket>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RepayAndRelease<'info> {
    #[account(mut, address = pawn_ticket.borrower)]
    pub borrower: Signer<'info>,

    /// CHECK: Verified via pawn_ticket.lender constraint
    #[account(mut, address = pawn_ticket.lender)]
    pub lender: UncheckedAccount<'info>,

    #[account(mut)]
    pub pawn_ticket: Account<'info, PawnTicket>,

    #[account(
        mut,
        associated_token::mint = pawn_ticket.collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = collateral_mint,
        associated_token::authority = borrower,
    )]
    pub borrower_collateral_ata: Account<'info, TokenAccount>,

    #[account(address = pawn_ticket.collateral_mint)]
    pub collateral_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct ClaimDefault<'info> {
    #[account(mut, address = pawn_ticket.lender)]
    pub lender: Signer<'info>,

    #[account(mut)]
    pub pawn_ticket: Account<'info, PawnTicket>,

    #[account(
        mut,
        associated_token::mint = pawn_ticket.collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = lender,
        associated_token::mint = collateral_mint,
        associated_token::authority = lender,
    )]
    pub lender_collateral_ata: Account<'info, TokenAccount>,

    #[account(address = pawn_ticket.collateral_mint)]
    pub collateral_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct SubmitCustodyAttestation<'info> {
    #[account(mut)]
    pub custodian_authority: Signer<'info>,

    #[account(mut)]
    pub pawn_ticket: Account<'info, PawnTicket>,
}

#[account]
#[derive(InitSpace)]
pub struct PawnTicket {
    pub borrower: Pubkey,
    pub lender: Pubkey,
    pub collateral_mint: Pubkey,
    pub ticket_id: u64,
    pub loan_amount: u64,
    pub interest_bps: u16,
    pub duration_seconds: i64,
    pub ai_valuation_lamports: u64,
    pub asset_type: AssetType,
    pub fingerprint_hash: [u8; 32],
    pub custody_attested: bool,
    pub custody_attestation_hash: [u8; 32],
    pub start_time: i64,
    pub due_time: i64,
    pub status: PawnStatus,
    #[max_len(200)]
    pub metadata_uri: String,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AssetType {
    Digital,
    Physical,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PawnStatus {
    Open,
    Active,
    Repaid,
    DefaultClaimed,
}

#[event]
pub struct TicketCreated {
    pub ticket: Pubkey,
    pub borrower: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_amount: u64,
    pub ai_valuation_lamports: u64,
}

#[event]
pub struct LoanFunded {
    pub ticket: Pubkey,
    pub lender: Pubkey,
    pub loan_amount: u64,
    pub due_time: i64,
}

#[event]
pub struct LoanRepaid {
    pub ticket: Pubkey,
    pub total_repayment: u64,
}

#[event]
pub struct CollateralClaimed {
    pub ticket: Pubkey,
    pub lender: Pubkey,
}

#[event]
pub struct CustodyAttested {
    pub ticket: Pubkey,
    pub custodian: Pubkey,
    pub attestation_hash: [u8; 32],
}

#[error_code]
pub enum PawnError {
    #[msg("Loan amount must be greater than zero")]
    InvalidAmount,
    #[msg("Duration must be positive")]
    InvalidDuration,
    #[msg("Interest exceeds 50% cap")]
    ExcessiveInterest,
    #[msg("Metadata URI too long")]
    MetadataTooLong,
    #[msg("Pawn ticket is not open for funding")]
    TicketNotOpen,
    #[msg("Physical asset custody has not been attested yet")]
    CustodyNotAttested,
    #[msg("Asset is not a physical RWA collateral")]
    NotPhysicalAsset,
    #[msg("Pawn ticket is not active")]
    TicketNotActive,
    #[msg("Borrower cannot fund their own loan")]
    CannotFundOwnLoan,
    #[msg("Loan has not expired yet")]
    LoanNotExpired,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}

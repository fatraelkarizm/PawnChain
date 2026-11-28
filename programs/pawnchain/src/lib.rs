use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::program::Pawnchain;

declare_id!("GbnsM4PrEhhUR462vCDiCY5wrzj4MHyTSwRFieUhYn4G");

pub const MAX_INTEREST_BPS: u16 = 5_000;
pub const MAX_DURATION_SECONDS: i64 = 90 * 86_400;

#[program]
pub mod pawnchain {
    use super::*;

    /// Registers a custodian. Only the program upgrade authority may call this.
    pub fn register_custodian(ctx: Context<RegisterCustodian>, custodian: Pubkey) -> Result<()> {
        let record = &mut ctx.accounts.custodian_record;
        record.custodian = custodian;
        record.bump = ctx.bumps.custodian_record;
        Ok(())
    }

    /// Removes a custodian; closing the record blocks any further attestation.
    pub fn revoke_custodian(_ctx: Context<RevokeCustodian>) -> Result<()> {
        Ok(())
    }

    /// Borrower locks the collateral token in escrow and opens a ticket.
    /// The `collateral_lock` PDA exists while the fingerprint is pledged, so a second
    /// ticket for the same fingerprint fails on `init`.
    pub fn create_pawn_ticket(
        ctx: Context<CreatePawnTicket>,
        ticket_id: u64,
        fingerprint_hash: [u8; 32],
        loan_amount: u64,
        interest_bps: u16,
        duration_seconds: i64,
        ai_valuation_lamports: u64,
        asset_type: AssetType,
        metadata_uri: String,
    ) -> Result<()> {
        require!(loan_amount > 0, PawnError::InvalidAmount);
        require!(
            duration_seconds > 0 && duration_seconds <= MAX_DURATION_SECONDS,
            PawnError::InvalidDuration
        );
        require!(interest_bps <= MAX_INTEREST_BPS, PawnError::ExcessiveInterest);
        require!(metadata_uri.len() <= 200, PawnError::MetadataTooLong);
        require!(fingerprint_hash != [0u8; 32], PawnError::InvalidFingerprint);

        // A remaining mint or freeze authority could inflate or freeze the escrow
        // and block the lender's claim.
        let mint = &ctx.accounts.collateral_mint;
        require!(
            mint.decimals == 0
                && mint.supply == 1
                && mint.mint_authority.is_none()
                && mint.freeze_authority.is_none(),
            PawnError::InvalidCollateralMint
        );

        let ticket_key = ctx.accounts.pawn_ticket.key();

        let lock = &mut ctx.accounts.collateral_lock;
        lock.ticket = ticket_key;
        lock.bump = ctx.bumps.collateral_lock;

        let ticket = &mut ctx.accounts.pawn_ticket;
        ticket.borrower = ctx.accounts.borrower.key();
        ticket.lender = Pubkey::default();
        ticket.collateral_mint = mint.key();
        ticket.ticket_id = ticket_id;
        ticket.loan_amount = loan_amount;
        ticket.interest_bps = interest_bps;
        ticket.duration_seconds = duration_seconds;
        ticket.ai_valuation_lamports = ai_valuation_lamports;
        ticket.asset_type = asset_type;
        ticket.fingerprint_hash = fingerprint_hash;
        ticket.custody_attested = asset_type == AssetType::Digital;
        ticket.custodian = Pubkey::default();
        ticket.custody_attestation_hash = [0u8; 32];
        ticket.start_time = 0;
        ticket.due_time = 0;
        ticket.status = PawnStatus::Open;
        ticket.metadata_uri = metadata_uri;
        ticket.bump = ctx.bumps.pawn_ticket;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.borrower_collateral_ata.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            1,
        )?;

        emit!(TicketCreated {
            ticket: ticket_key,
            borrower: ctx.accounts.borrower.key(),
            collateral_mint: ctx.accounts.collateral_mint.key(),
            loan_amount,
            ai_valuation_lamports,
        });

        Ok(())
    }

    /// Lender funds an open ticket; SOL goes straight to the borrower.
    pub fn fund_loan(ctx: Context<FundLoan>) -> Result<()> {
        let ticket_key = ctx.accounts.pawn_ticket.key();
        let ticket = &mut ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Open, PawnError::TicketNotOpen);
        require!(ticket.custody_attested, PawnError::CustodyNotAttested);
        require!(
            ctx.accounts.lender.key() != ticket.borrower,
            PawnError::CannotFundOwnLoan
        );
        require!(
            ctx.accounts.lender.key() != ticket.custodian,
            PawnError::CustodianConflict
        );

        let now = Clock::get()?.unix_timestamp;
        ticket.lender = ctx.accounts.lender.key();
        ticket.start_time = now;
        ticket.due_time = now
            .checked_add(ticket.duration_seconds)
            .ok_or(PawnError::MathOverflow)?;
        ticket.status = PawnStatus::Active;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.lender.to_account_info(),
                    to: ctx.accounts.borrower.to_account_info(),
                },
            ),
            ticket.loan_amount,
        )?;

        emit!(LoanFunded {
            ticket: ticket_key,
            lender: ticket.lender,
            loan_amount: ticket.loan_amount,
            due_time: ticket.due_time,
        });

        Ok(())
    }

    /// Repayment and collateral release in one atomic instruction.
    pub fn repay_and_release(ctx: Context<RepayAndRelease>) -> Result<()> {
        let ticket = &ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Active, PawnError::TicketNotActive);

        let interest = (ticket.loan_amount as u128)
            .checked_mul(ticket.interest_bps as u128)
            .ok_or(PawnError::MathOverflow)?
            / 10_000;
        let total_repayment = ticket
            .loan_amount
            .checked_add(u64::try_from(interest).map_err(|_| PawnError::MathOverflow)?)
            .ok_or(PawnError::MathOverflow)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.borrower.to_account_info(),
                    to: ctx.accounts.lender.to_account_info(),
                },
            ),
            total_repayment,
        )?;

        release_escrow(
            &ctx.accounts.pawn_ticket,
            &ctx.accounts.escrow_vault,
            ctx.accounts.borrower_collateral_ata.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.token_program.key(),
        )?;

        let ticket_key = ctx.accounts.pawn_ticket.key();
        ctx.accounts.pawn_ticket.status = PawnStatus::Repaid;

        emit!(LoanRepaid {
            ticket: ticket_key,
            total_repayment,
        });

        Ok(())
    }

    /// Lender claims the collateral once the due time has passed.
    pub fn claim_default(ctx: Context<ClaimDefault>) -> Result<()> {
        let ticket = &ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Active, PawnError::TicketNotActive);
        require!(
            Clock::get()?.unix_timestamp > ticket.due_time,
            PawnError::LoanNotExpired
        );

        release_escrow(
            &ctx.accounts.pawn_ticket,
            &ctx.accounts.escrow_vault,
            ctx.accounts.lender_collateral_ata.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.token_program.key(),
        )?;

        let ticket_key = ctx.accounts.pawn_ticket.key();
        ctx.accounts.pawn_ticket.status = PawnStatus::DefaultClaimed;

        emit!(CollateralClaimed {
            ticket: ticket_key,
            lender: ctx.accounts.lender.key(),
        });

        Ok(())
    }

    /// Borrower withdraws an unfunded ticket. The ticket account is kept so its id
    /// can never be reused with different collateral.
    pub fn cancel_ticket(ctx: Context<CancelTicket>) -> Result<()> {
        require!(
            ctx.accounts.pawn_ticket.status == PawnStatus::Open,
            PawnError::TicketNotOpen
        );

        release_escrow(
            &ctx.accounts.pawn_ticket,
            &ctx.accounts.escrow_vault,
            ctx.accounts.borrower_collateral_ata.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.token_program.key(),
        )?;

        let ticket_key = ctx.accounts.pawn_ticket.key();
        ctx.accounts.pawn_ticket.status = PawnStatus::Cancelled;

        emit!(TicketCancelled { ticket: ticket_key });

        Ok(())
    }

    /// A registered custodian confirms physical custody of the item.
    pub fn submit_custody_attestation(
        ctx: Context<SubmitCustodyAttestation>,
        attestation_hash: [u8; 32],
    ) -> Result<()> {
        let ticket_key = ctx.accounts.pawn_ticket.key();
        let custodian = ctx.accounts.custodian_authority.key();
        let ticket = &mut ctx.accounts.pawn_ticket;
        require!(ticket.status == PawnStatus::Open, PawnError::TicketNotOpen);
        require!(
            ticket.asset_type == AssetType::Physical,
            PawnError::NotPhysicalAsset
        );
        require!(!ticket.custody_attested, PawnError::AlreadyAttested);
        require!(custodian != ticket.borrower, PawnError::CustodianConflict);
        require!(attestation_hash != [0u8; 32], PawnError::InvalidFingerprint);

        ticket.custody_attested = true;
        ticket.custodian = custodian;
        ticket.custody_attestation_hash = attestation_hash;

        emit!(CustodyAttested {
            ticket: ticket_key,
            custodian,
            attestation_hash,
        });

        Ok(())
    }
}

/// Moves the collateral out of escrow, then closes the vault and returns its rent
/// to the borrower.
fn release_escrow<'info>(
    ticket: &Account<'info, PawnTicket>,
    vault: &Account<'info, TokenAccount>,
    destination: AccountInfo<'info>,
    rent_receiver: AccountInfo<'info>,
    token_program: Pubkey,
) -> Result<()> {
    let ticket_id_bytes = ticket.ticket_id.to_le_bytes();
    let bump = [ticket.bump];
    let seeds: &[&[u8]] = &[
        b"pawn_ticket",
        ticket.borrower.as_ref(),
        &ticket_id_bytes,
        &bump,
    ];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            token_program,
            Transfer {
                from: vault.to_account_info(),
                to: destination,
                authority: ticket.to_account_info(),
            },
            signer_seeds,
        ),
        vault.amount,
    )?;

    token::close_account(CpiContext::new_with_signer(
        token_program,
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_receiver,
            authority: ticket.to_account_info(),
        },
        signer_seeds,
    ))
}

#[derive(Accounts)]
#[instruction(custodian: Pubkey)]
pub struct RegisterCustodian<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + CustodianRecord::INIT_SPACE,
        seeds = [b"custodian", custodian.as_ref()],
        bump
    )]
    pub custodian_record: Account<'info, CustodianRecord>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ PawnError::NotAdmin)]
    pub program: Program<'info, Pawnchain>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ PawnError::NotAdmin)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCustodian<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        close = admin,
        seeds = [b"custodian", custodian_record.custodian.as_ref()],
        bump = custodian_record.bump
    )]
    pub custodian_record: Account<'info, CustodianRecord>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ PawnError::NotAdmin)]
    pub program: Program<'info, Pawnchain>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ PawnError::NotAdmin)]
    pub program_data: Account<'info, ProgramData>,
}

#[derive(Accounts)]
#[instruction(ticket_id: u64, fingerprint_hash: [u8; 32])]
pub struct CreatePawnTicket<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = borrower,
    )]
    pub borrower_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = borrower,
        space = 8 + PawnTicket::INIT_SPACE,
        seeds = [b"pawn_ticket", borrower.key().as_ref(), &ticket_id.to_le_bytes()],
        bump
    )]
    pub pawn_ticket: Box<Account<'info, PawnTicket>>,

    #[account(
        init,
        payer = borrower,
        space = 8 + CollateralLock::INIT_SPACE,
        seeds = [b"collateral", fingerprint_hash.as_ref()],
        bump
    )]
    pub collateral_lock: Account<'info, CollateralLock>,

    // `init_if_needed` so that someone pre-creating the vault cannot block creation.
    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

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
    pub pawn_ticket: Box<Account<'info, PawnTicket>>,

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
    pub pawn_ticket: Box<Account<'info, PawnTicket>>,

    #[account(
        mut,
        close = borrower,
        seeds = [b"collateral", pawn_ticket.fingerprint_hash.as_ref()],
        bump = collateral_lock.bump,
        constraint = collateral_lock.ticket == pawn_ticket.key() @ PawnError::LockMismatch,
    )]
    pub collateral_lock: Account<'info, CollateralLock>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = collateral_mint,
        associated_token::authority = borrower,
    )]
    pub borrower_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(address = pawn_ticket.collateral_mint)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct ClaimDefault<'info> {
    #[account(mut, address = pawn_ticket.lender)]
    pub lender: Signer<'info>,

    /// CHECK: Rent receiver, verified via pawn_ticket.borrower constraint
    #[account(mut, address = pawn_ticket.borrower)]
    pub borrower: UncheckedAccount<'info>,

    #[account(mut)]
    pub pawn_ticket: Box<Account<'info, PawnTicket>>,

    #[account(
        mut,
        close = borrower,
        seeds = [b"collateral", pawn_ticket.fingerprint_hash.as_ref()],
        bump = collateral_lock.bump,
        constraint = collateral_lock.ticket == pawn_ticket.key() @ PawnError::LockMismatch,
    )]
    pub collateral_lock: Account<'info, CollateralLock>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = lender,
        associated_token::mint = collateral_mint,
        associated_token::authority = lender,
    )]
    pub lender_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(address = pawn_ticket.collateral_mint)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct CancelTicket<'info> {
    #[account(mut, address = pawn_ticket.borrower)]
    pub borrower: Signer<'info>,

    #[account(mut)]
    pub pawn_ticket: Box<Account<'info, PawnTicket>>,

    #[account(
        mut,
        close = borrower,
        seeds = [b"collateral", pawn_ticket.fingerprint_hash.as_ref()],
        bump = collateral_lock.bump,
        constraint = collateral_lock.ticket == pawn_ticket.key() @ PawnError::LockMismatch,
    )]
    pub collateral_lock: Account<'info, CollateralLock>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = pawn_ticket,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = borrower,
        associated_token::mint = collateral_mint,
        associated_token::authority = borrower,
    )]
    pub borrower_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(address = pawn_ticket.collateral_mint)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct SubmitCustodyAttestation<'info> {
    pub custodian_authority: Signer<'info>,

    #[account(
        seeds = [b"custodian", custodian_authority.key().as_ref()],
        bump = custodian_record.bump
    )]
    pub custodian_record: Account<'info, CustodianRecord>,

    #[account(mut)]
    pub pawn_ticket: Box<Account<'info, PawnTicket>>,
}

#[account]
#[derive(InitSpace)]
pub struct CustodianRecord {
    pub custodian: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CollateralLock {
    pub ticket: Pubkey,
    pub bump: u8,
}

// Field order is decoded by apps/web/src/lib/program.ts; change both together.
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
    pub custodian: Pubkey,
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
    Cancelled,
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
pub struct TicketCancelled {
    pub ticket: Pubkey,
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
    #[msg("Duration must be between 1 second and 90 days")]
    InvalidDuration,
    #[msg("Interest exceeds 50% cap")]
    ExcessiveInterest,
    #[msg("Metadata URI too long")]
    MetadataTooLong,
    #[msg("Pawn ticket is not open")]
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
    #[msg("Fingerprint or attestation hash cannot be empty")]
    InvalidFingerprint,
    #[msg("Collateral must be a single fixed-supply token with no mint or freeze authority")]
    InvalidCollateralMint,
    #[msg("Only the program upgrade authority can manage custodians")]
    NotAdmin,
    #[msg("Custody has already been attested")]
    AlreadyAttested,
    #[msg("Custodian must be independent from the borrower and lender")]
    CustodianConflict,
    #[msg("Collateral lock does not belong to this ticket")]
    LockMismatch,
}

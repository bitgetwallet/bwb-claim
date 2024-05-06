use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Protocol paused")]
    ProtocolPaused,
    #[msg("Invalid Merkle proof.")]
    InvalidProof,
    #[msg("Drop already claimed.")]
    DropAlreadyClaimed,
    #[msg("Exceeded maximum claim amount.")]
    ExceededMaxClaim,
    #[msg("Exceeded maximum number of claimed nodes.")]
    ExceededMaxNumNodes,
    #[msg("Account is not authorized to execute this instruction")]
    Unauthorized,
    #[msg("Admin account not match distributor creator")]
    DistributorAdminMismatch,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("update root no change")]
    UpdateRootNoChange,
    #[msg("Arithmetic Error (overflow/underflow)")]
    ArithmeticError,
    #[msg("Signature verification failed.")]
    SigVerificationFailed,
    #[msg("Invaild receipent ATA")]
    InvaildReceipentATA,
    #[msg("Too early to claim")]
    TooEarlyToClaim

}

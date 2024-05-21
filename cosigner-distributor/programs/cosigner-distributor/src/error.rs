use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Protocol paused")]
    ProtocolPaused,
    #[msg("Drop already claimed.")]
    DropAlreadyClaimed,
    #[msg("Account is not authorized to execute this instruction")]
    Unauthorized,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Arithmetic Error (overflow/underflow)")]
    ArithmeticError,
    #[msg("Too early to claim")]
    TooEarlyToClaim,
    #[msg("Admin account not match distributor creator")]
    DistributorAdminMismatch,
    #[msg("Amount over balance")]
    AmountOverBalance,
    #[msg("Withdraw amount need GT 0")]
    WithdrawAmountNeedGT0,
    #[msg("New receiver is same with old receiver")]
    SameReceivers


}

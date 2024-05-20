import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { CosignerDistributor } from "../target/types/cosigner_distributor";
import {
    Transaction,
    Keypair,
    PublicKey,
    SystemProgram,
} from '@solana/web3.js';

import {
    createKeypairFromFile,
    getPayer,
    initializeSigner,
} from '../utils/utils';

import { getMinimumBalanceForRentExemptMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";


(async () => {

    let payer: Keypair = await getPayer();
    let cosigner: Keypair = await initializeSigner('../keys/wallet-pair-cosigner.json');
    let admin_auth = await initializeSigner('../keys/fund_account.json');
    let receiver: Keypair = await initializeSigner('../keys/receiver-keypair.json');
    let operator: Keypair = await initializeSigner('../keys/operate-keypair.json');
    let programIdSelf: Keypair = await initializeSigner('../keys/cosigner_distributor-keypair12.json');
    console.log("payer is : " + payer.publicKey);
    console.log("cosigner is : " + cosigner.publicKey);
    console.log("admin_auth is : " + admin_auth.publicKey);
    console.log("receiver is : " + receiver.publicKey.toBase58());
    console.log("operator is : " + operator.publicKey.toBase58());
    console.log("programIdSelf is : " + programIdSelf.publicKey.toBase58());

    // mainnet
    let token_mint = new PublicKey("G1GV35DHibxUDJtMC9DBRzruqhLhEe6tr85WQ73XoPJ3");//mainnet TT02

    process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
    process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com';

    const connection = new anchor.web3.Connection(process.env.ANCHOR_PROVIDER_URL);
    const wallet = new anchor.Wallet(await createKeypairFromFile(process.env.ANCHOR_WALLET));

    const provider = new AnchorProvider(connection, wallet, {});

    if (!provider) return;

    // Configure the client to use the local cluster.
    // anchor.setProvider(anchor.AnchorProvider.env());
    anchor.setProvider(provider);

    const program = anchor.workspace.CosignerDistributor as Program<CosignerDistributor>;

    // const program = new Program(
    //     helloWorldprogramInterface,
    //     helloWorldprogramId,
    //     provider
    //   ) as Program<SolanaHelloWorld>;


    console.log("===program is: ", program.programId);

    let [distributorPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("MerkleDistributor")],
        program.programId
    );

    let evmClaimer01 = "0x1D2440612571006CFAE090A9C8198a4a4e9b0a61"//地址大小写区分
    let evmClaimer02 = "0xAc0E6Bf367Fd747b975914601A0A2F482d10Db80"
    let evmClaimer03 = "0x2c4DFAb84C64Ca6a4676D022f39f87c21096e93D"

    let evmClaimer = evmClaimer01;
    let [claimStatusPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("ClaimStatus"), distributorPda.toBuffer(), Buffer.from(evmClaimer.slice(2), 'hex')],
        program.programId
    );


    let [tokenVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault")],
        program.programId
    );

    console.log("distributorPda: " + distributorPda);
    console.log("claimStatusPda: " + claimStatusPda);
    console.log("tokenVaultPda: " + tokenVaultPda);


    let now_time = Date.now();
    let time_stamp = (now_time / 1000).toFixed();
    console.log("now_time is", time_stamp);
    try {
        let tx = new Transaction();

        tx.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        tx.feePayer = admin_auth.publicKey;

        const ins = await program.methods.newDistributor(
            new anchor.BN(time_stamp),
            cosigner.publicKey,
            admin_auth.publicKey,
            receiver.publicKey,
            operator.publicKey
        ).accounts({
            payer: admin_auth.publicKey,
            distributor: distributorPda,
            tokenVault: tokenVaultPda,
            mint: token_mint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID
        }).instruction();

        tx.add(ins);
        tx.sign(admin_auth);

        console.log(tx)

        await provider.connection.sendTransaction(tx, [admin_auth]);

        let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
        console.log("distributorData is", distributorData);
    } catch (err) {
        console.log("Transaction error: ", err);
        return;
    }
})();

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MerkleDistributor } from "../target/types/merkle_distributor";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
  
} from '@solana/web3.js';

import {
  getPayer,
  initializeSigner,
  hexToBytes
} from '../utils/utils';

// import { parseBalanceMap } from "../utils/evm-src/parse-balance-map";
import { parseBalanceMap } from "../utils/parse-balance-map";
import {airdropData as airdropDataRaw} from "../data/airdrop-amounts";
import { u64,TOKEN_PROGRAM_ID,} from "@solana/spl-token";

import { ethers,Signer} from "ethers"
import 'dotenv/config'
import { hashMessage } from "@ethersproject/hash";
import { splitSignature } from "ethers/lib/utils";

const { API_URL, PRIVATE_KEY } = process.env;

const provider = new ethers.providers.AlchemyProvider("mainnet", API_URL);


/// Sample Create Signature function that signs with ethers signMessage
async function createSignature(eth_signer: ethers.Wallet, solanaPublicKey: string): Promise<string> {
  // keccak256 hash of the message
  const messageHash: string = ethers.utils.solidityKeccak256(
      ['string'],
      [solanaPublicKey]
  );

  // get hash as Uint8Array of size 32
  const messageHashBytes: Uint8Array = ethers.utils.arrayify(messageHash);

  // Signed message that is actually this:
  // sign(keccak256("\x19Ethereum Signed Message:\n" + len(messageHash) + messageHash)))
  const signature = await eth_signer.signMessage(messageHashBytes);

  return signature;
}


( async () => {
  
  const message = "8FcA5Yhi38rcv5hm6yByXq54LriNsCwzedykAP7VVBgQ";
  // Message we are signing
  const walletInst = new ethers.Wallet(PRIVATE_KEY, provider);
  // // Unlike Web3.js, Ethers seperates the provider instance and wallet instance, so we must also create a wallet instance
  // const signMessage = await walletInst.signMessage(message); 
  // let splitSig = splitSignature(signMessage)
  // let recovery_id = splitSig.v;
  // let signatureRS = splitSig.compact;

  // const hashedString = hashStringWithKeccak(message);
  // console.log('=======Hashed String (Keccak):', hashedString);

  // return;

  // Solana and Ethereum wallets
  const eth_signer: ethers.Wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const person: anchor.web3.Keypair = await getPayer();

  // Stuff
  const PERSON = { solanaPublicKey: '8FcA5Yhi38rcv5hm6yByXq54LriNsCwzedykAP7VVBgQ'}; // mock data
  let eth_address: string; // Ethereum address to be recovered and checked against
  let full_sig: string; // 64 bytes + recovery byte
  let signature: Uint8Array; // 64 bytes of sig
  let recoveryId: number; // recovery byte (u8)
  let actual_message: Buffer; // actual signed message with Ethereum Message prefix

  // Signature
  // Full sig consists of 64 bytes + recovery byte
  full_sig = await createSignature(eth_signer, PERSON.solanaPublicKey );

  let full_sig_bytes = ethers.utils.arrayify(full_sig);
  signature = full_sig_bytes.slice(0, 64);
  recoveryId = full_sig_bytes[64] - 27;

  let msg_digest = ethers.utils.arrayify(
      ethers.utils.solidityKeccak256(['string'],[PERSON.solanaPublicKey])
  );
  actual_message = Buffer.concat([
      Buffer.from('\x19Ethereum Signed Message:\n32'),
      msg_digest,
  ]);

  // Calculated Ethereum Address (20 bytes) from public key (32 bytes)
  eth_address = ethers.utils
      .computeAddress(eth_signer.publicKey)
      .slice(2);


  
  //'0x255227504d4448255e0b55955f942851aafc2c4cd435d853d1b87d131d48e814140922514ff888a1ba3e1537073bc0e525abcce1413effbbb64fdc088cac0ad31c'

  //// Using our wallet instance which holds our private key, we call the Ethers signMessage function and pass our message inside
  // const messageSigner = signMessage.then((value) => {
  //   const verifySigner = ethers.utils.recoverAddress(hashMessage(message),value);
  //   return verifySigner;
  //   // Now we verify the signature by calling the recoverAddress function which takes a message hash and signature hash and returns the signer address
  // });

  process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
  //process.env.ANCHOR_PROVIDER_URL = 'https://convincing-damp-leaf.solana-mainnet.quiknode.pro/edde6ea1d584780dce63a8d70cb673b94dd025a8/';
  // process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com';
  process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const program = anchor.workspace.MerkleDistributor as Program<MerkleDistributor>;

  let payer: Keypair = await getPayer();
  let base: Keypair = await initializeSigner('../keys/wallet-pair-cosigner.json');
  let admin_auth = await initializeSigner('../keys/fund_account.json');
  console.log("payer is : " + payer.publicKey);
  console.log("base is : " + base.publicKey);
  console.log("admin_auth is : " + admin_auth.publicKey);


  let [distributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MerkleDistributor"), base.publicKey.toBuffer()],
    program.programId
  );

  let evmClaimer01 = "0x1D2440612571006CFAE090A9C8198a4a4e9b0a61"//地址大小写区分
  let evmClaimer02 = "0xAc0E6Bf367Fd747b975914601A0A2F482d10Db80"
  let evmClaimer03 = "0x2c4DFAb84C64Ca6a4676D022f39f87c21096e93D"

  evmClaimer01 = evmClaimer01;
  let [claimStatusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ClaimStatus"), distributorPda.toBuffer() ,Buffer.from(evmClaimer01.slice(2), 'hex')],
    program.programId
  );

  let token_mint = new PublicKey("83QLg6QKjfFCgoFWTx8x2EAytbAwVgA5G1mtAcsnybtp");
  let payer_ata = new PublicKey("AR1aJmL5jWmV53bQXSQaHNvB6uqmbC9yH1yVqhRnHvvi");

  let [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), token_mint.toBuffer()],
    program.programId
  );

  console.log("distributorPda: " + distributorPda);
  console.log("claimStatusPda: " + claimStatusPda);
  console.log("tokenVaultPda: " + tokenVaultPda);

  

  //senderTokenAccount = await createAssociatedTokenAccountIdempotent(connection, receiver, mint, receiver.publicKey, {}, TOKEN_2022_PROGRAM_ID);

  // Add your test here.
  const balanceMap: { [authority: string]: u64 } = {};
  // airdropDataRaw.forEach(({ authority, amount }) => {
  //   const prevBalance = balanceMap[authority];
  //   if (prevBalance) {
  //     balanceMap[authority] = prevBalance.add(new u64(amount));
  //   } else {
  //     balanceMap[authority] = new u64(amount);
  //   }
  // });
  

  const { claims, merkleRoot, tokenTotal } = parseBalanceMap(airdropDataRaw);
  // let root: number[] = Array.from(Buffer.from(merkleRoot, 'utf8'));
  let root: number[] = Array.from(merkleRoot);
  let maxTotalClaim = new u64(tokenTotal);
  let maxNumNodes = new u64(Object.keys(claims).length);

  
  // let tx = await program.methods.newDistributor(
  //   root,
  //   maxTotalClaim,
  //   maxNumNodes
  // ).accounts({
  //   base:base.publicKey,
  //   adminAuth: admin_auth.publicKey,
  //   distributor: distributorPda,
  //   tokenVault:tokenVaultPda,
  //   mint: token_mint,
  //   systemProgram: SystemProgram.programId,
  //   tokenProgram: TOKEN_PROGRAM_ID
  // }).signers([base, admin_auth])
  // .rpc();

  // let tx = await program.methods.updateDistributor(
  //   root,
  //   maxTotalClaim,
  //   maxNumNodes
  // ).accounts({
    
  //   adminAuth: admin_auth.publicKey,
  //   distributor: distributorPda,
  // }).signers([admin_auth])
  // .rpc();


  let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
  console.log("distributorData is", distributorData);
  // expect(distributorData.maxTotalClaim).equal(maxTotalClaim);

  let toTokenAccountPda = payer_ata;
  
  let evmClaimer01Claim = claims[evmClaimer01];
  console.log("claims[evmClaimer01] is", evmClaimer01Claim);
  // let proof = evmClaimer01Claim.proof.map(hexString =>
  //   Array.from(hexString.slice(2), char => parseInt(char, 16)));
  // let index = new anchor.BN(claims[evmClaimer01].index);
  // let amount = new anchor.BN(claims[evmClaimer01].amount.slice(2), "hex");

  let proof = evmClaimer01Claim.proof.map(buffer => Array.from(buffer));
  let index = new u64(claims[evmClaimer01].index);
  let amount = new u64(claims[evmClaimer01].amount);
  let evmClaimer01Bytes =await hexToBytes(evmClaimer01);
  //return;
  
  console.log("TOKEN_PROGRAM_ID is", TOKEN_PROGRAM_ID);
  let tx = await program.methods.claim(
  //let tx = await program.methods.claimTestNode(
    evmClaimer01Bytes,
    index,
    amount,
    proof
  ).accounts({
    distributor: distributorPda,
    claimStatus: claimStatusPda,
    mint: token_mint,
    fromTokenVault: tokenVaultPda,
    to:payer_ata,
    claimant:payer.publicKey,
    cosigner:base.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    ixSysvar:anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY
  }).signers([payer,base])
  .rpc();

  console.log("Your transaction signature", tx);
  
})();

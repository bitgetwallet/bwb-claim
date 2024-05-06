/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import * as bs58 from 'bs58';
import fs from 'mz/fs';
import os from 'os';
import path from 'path';
import yaml from 'yaml';

import { Keypair } from '@solana/web3.js';

// import {
//   ASSOCIATED_TOKEN_PROGRAM_ID,
//   getAssociatedTokenAddress,
//   TOKEN_PROGRAM_ID,
// } from '@solana/spl-token';
// import { Keypair } from '@solana/web3.js';
// export async function getAssociatedTokenAccount(mint, owner) {
//   const tokenAccount = await getAssociatedTokenAddress(
//         mint,
//         owner,  
//         true,
//         TOKEN_PROGRAM_ID,
//         ASSOCIATED_TOKEN_PROGRAM_ID,
//     );
//   return tokenAccount;
// }


/**
 * @private
 */
async function getConfig(): Promise<any> {
  // Path to Solana CLI config file
  const CONFIG_FILE_PATH = path.resolve(
    os.homedir(),
    '.config',
    'solana',
    'cli',
    'config.yml',
  );
  const configYml = await fs.readFile(CONFIG_FILE_PATH, {encoding: 'utf8'});
  return yaml.parse(configYml);
}

/**
 * Load and parse the Solana CLI config file to determine which RPC url to use
 */
export async function getRpcUrl(): Promise<string> {
  try {
    const config = await getConfig();
    if (!config.json_rpc_url) throw new Error('Missing RPC URL');
    return config.json_rpc_url;
  } catch (err) {
    console.warn(
      'Failed to read RPC url from CLI config file, falling back to localhost',
    );
    return 'http://127.0.0.1:8899';
  }
}

/**
 * Load and parse the Solana CLI config file to determine which payer to use
 */
export async function getPayer(): Promise<Keypair> {
  try {
    const config = await getConfig();
    if (!config.keypair_path) throw new Error('Missing keypair path');
    return await createKeypairFromFile(config.keypair_path);
  } catch (err) {
    console.warn(
      'Failed to create keypair from CLI config file, falling back to new random keypair',
    );
    return Keypair.generate();
  }
}

/**
 * Create a Keypair from a secret key stored in file as bytes' array
 */
export async function createKeypairFromFile(
  filePath: string,
): Promise<Keypair> {
  const secretKeyString = await fs.readFile(filePath, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  // console.log("secretKey is", secretKey);
  return Keypair.fromSecretKey(secretKey);
}

export async function createKeypairFromBs58StringFile(key_str: string): Promise<Keypair> {
  const base58String = key_str;
  const decodedBytes = bs58.decode(base58String);
  const secretKeyUint8Array = new Uint8Array(decodedBytes);
  return Keypair.fromSecretKey(secretKeyUint8Array);
}

export async function hexToBytes(hex: string): Promise<number[]> {
  // remove "0x" prefix
  hex = hex.replace(/^0x/, '');

  let bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }

  return bytes;
}

export async function initializeSigner(pathStr: string): Promise<Keypair> {
  const SIGNER_KEYPAIR_PATH = path.resolve(__dirname, pathStr);
  console.log("SIGNER_KEYPAIR_PATH is",SIGNER_KEYPAIR_PATH);
  let signer : Keypair = await createKeypairFromFile(SIGNER_KEYPAIR_PATH);
  return signer;
}

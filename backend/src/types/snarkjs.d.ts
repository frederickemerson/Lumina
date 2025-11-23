/**
 * Type declarations for snarkjs
 */

declare module 'snarkjs' {
  export const groth16: {
    fullProve: (
      input: any,
      wasmPath: string,
      zkeyPath: string
    ) => Promise<{
      proof: any;
      publicSignals: any[];
    }>;
    verify: (
      publicSignals: any[],
      proof: any,
      verificationKey: any
    ) => Promise<boolean>;
  };
}


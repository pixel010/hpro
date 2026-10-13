/** Error codes are stable identifiers; messages are for humans and may change. */
export type ContainerErrorCode =
  | 'zip-structure'
  | 'zip-unsupported'
  | 'zip-limit'
  | 'zip-crc'
  | 'zip-path'
  | 'mimetype'
  | 'container-xml'
  | 'manifest'
  | 'input'
  | 'write-verification'
  | 'signature'
  | 'timestamp'
  | 'remote-signer';

export class ContainerError extends Error {
  readonly code: ContainerErrorCode;
  readonly path: string | undefined;

  constructor(code: ContainerErrorCode, message: string, path?: string) {
    super(path === undefined ? message : `${message} (${path})`);
    this.name = 'ContainerError';
    this.code = code;
    this.path = path;
  }
}

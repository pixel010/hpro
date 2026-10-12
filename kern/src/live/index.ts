/** Live content (package P15): component policy, frame CSP, data channel, saving data. */
export { FORBIDDEN_SANDBOX_TOKENS, SANDBOX_TOKENS, checkSandbox, frameCsp, planComponents } from './policy.js';
export type { ComponentDecision, ComponentPlan, ComponentState, CspOptions, PlanOptions } from './policy.js';
export { CHANNEL_SPEC, DATA_PATH, DataChannel, MAX_MESSAGES_PER_SECOND, MAX_VALUE_BYTES, isJsonLike } from './channel.js';
export type { ChannelErrorCode, ChannelMessage, ChannelOptions, ChannelOutput } from './channel.js';
export { saveDataChanges } from './save.js';
export type { SaveDataOptions } from './save.js';

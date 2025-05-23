import { EnvironmentYamlConfig, Inputs } from './types';
export type GitHubError = Error & {
    status?: number;
};
export declare function getInputs(): Promise<Inputs>;
export declare function loadConfig(configPath: string): Promise<EnvironmentYamlConfig>;
export declare function run(): Promise<void>;

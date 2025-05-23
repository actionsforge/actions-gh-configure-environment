interface Reviewer {
    type: 'User' | 'Team';
    id?: number;
    login?: string;
    slug?: string;
}
interface EnvironmentConfig {
    wait_timer?: number;
    reviewers?: Reviewer[];
    prevent_self_review?: boolean;
    deployment_branch_policy?: {
        protected_branches: boolean;
        custom_branch_policies: boolean;
    };
}
interface EnvironmentYamlConfig {
    environments: {
        [key: string]: EnvironmentConfig;
    };
}
interface Inputs {
    configPath: string;
    dryRun: boolean;
    token: string;
    debug: boolean;
}

type GitHubError = Error & {
    status?: number;
};
declare function getInputs(): Promise<Inputs>;
declare function loadConfig(configPath: string): Promise<EnvironmentYamlConfig>;
declare function run(): Promise<void>;

export { type GitHubError, getInputs, loadConfig, run };

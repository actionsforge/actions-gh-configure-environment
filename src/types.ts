export interface Reviewer {
  type: 'User' | 'Team';
  id?: number;
  login?: string;
  slug?: string;
}

export interface EnvironmentConfig {
  wait_timer?: number;
  reviewers?: Reviewer[];
  prevent_self_review?: boolean;
  deployment_branch_policy?: {
    protected_branches: boolean;
    custom_branch_policies: boolean;
  };
}

export interface EnvironmentYamlConfig {
  environments: {
    [key: string]: EnvironmentConfig;
  };
}

export interface Inputs {
  configPath: string;
  dryRun: boolean;
  token: string;
  debug: boolean;
}

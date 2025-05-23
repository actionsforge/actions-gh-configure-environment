"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.loadConfig = exports.getInputs = void 0;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const github_1 = require("./github");
const utils_1 = require("./utils");
async function getInputs() {
    const token = core.getInput('token') || process.env.GH_ENV_CONFIG_TOKEN;
    if (!token) {
        throw new Error('No token provided');
    }
    return {
        configPath: core.getInput('config-path') || '.github/environments.yaml',
        dryRun: core.getInput('dry-run') === 'true' || process.env.INPUT_DRY_RUN === 'true',
        token,
        debug: core.getInput('debug') === 'true' || process.env.INPUT_DEBUG === 'true'
    };
}
exports.getInputs = getInputs;
async function loadConfig(configPath) {
    try {
        const configFile = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(configFile);
        if (!config.environments) {
            throw new Error('Invalid configuration: missing "environments" key');
        }
        // Handle case where environments is an empty array
        if (Array.isArray(config.environments) && config.environments.length === 0) {
            config.environments = {};
        }
        return config;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to load config from ${configPath}: ${errorMessage}`);
    }
}
exports.loadConfig = loadConfig;
async function run() {
    try {
        const inputs = await getInputs();
        (0, utils_1.logDebug)(inputs.debug, 'Debug mode is enabled');
        if (!process.env.GITHUB_REPOSITORY) {
            throw new Error('GITHUB_REPOSITORY environment variable is required');
        }
        const githubService = new github_1.GitHubService(inputs.token, process.env.GITHUB_REPOSITORY);
        const config = await loadConfig(inputs.configPath);
        (0, utils_1.logDebug)(inputs.debug, `Loaded configuration: ${JSON.stringify(config)}`);
        // Get all existing environments
        const existingEnvironments = await githubService.getAllEnvironments();
        const configuredEnvironments = new Set(Object.keys(config.environments));
        const environmentsToDelete = existingEnvironments.filter((env) => !configuredEnvironments.has(env));
        // Handle environments that need to be deleted
        if (environmentsToDelete.length > 0) {
            core.info(`Found ${environmentsToDelete.length} environments to delete: ${environmentsToDelete.join(', ')}`);
            if (inputs.dryRun) {
                core.info(`[DRY RUN] Would delete environments: ${environmentsToDelete.join(', ')}`);
                return;
            }
            for (const envName of environmentsToDelete) {
                try {
                    await githubService.deleteAnEnvironment(envName);
                    core.info(`Successfully deleted environment: ${envName}`);
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    core.error(`Failed to delete environment ${envName}: ${errorMessage}`);
                    throw error;
                }
            }
        }
        // Handle case where no environments are configured
        if (Object.keys(config.environments).length === 0) {
            if (inputs.dryRun) {
                core.info('[DRY RUN] No environments to configure');
            }
            (0, utils_1.logDebug)(inputs.debug, 'No environments found in configuration');
            core.info('No environments to configure');
            if (inputs.dryRun) {
                return;
            }
            return;
        }
        // Then, create or update environments from the YAML
        for (const [envName, envConfig] of Object.entries(config.environments)) {
            core.info(`Processing environment: ${envName}`);
            // Get current configuration
            let currentConfig = {};
            try {
                currentConfig = await githubService.getEnvironmentConfig(envName);
                (0, utils_1.logDebug)(inputs.debug, `Current config for ${envName}: ${JSON.stringify(currentConfig)}`);
            }
            catch (err) {
                (0, utils_1.logDebug)(inputs.debug, `Environment ${envName} does not exist yet`);
            }
            // Process reviewers if any (moved to GitHubService)
            const reviewers = await githubService.resolveReviewers(envName, envConfig.reviewers || []);
            // Prepare the environment configuration
            const environmentConfig = {
                wait_timer: envConfig.wait_timer,
                reviewers,
                prevent_self_review: envConfig.prevent_self_review,
                deployment_branch_policy: envConfig.deployment_branch_policy
            };
            (0, utils_1.logDebug)(inputs.debug, `Desired config for ${envName}: ${JSON.stringify(environmentConfig)}`);
            if (inputs.dryRun) {
                core.info(`[DRY RUN] Would update environment ${envName}`);
                continue;
            }
            const result = await githubService.updateEnvironment(envName, environmentConfig);
            core.info(result.message);
        }
        core.setOutput('status', 'success');
        core.setOutput('message', 'All environments configured successfully');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        core.error(errorMessage);
        core.setFailed(errorMessage);
        core.setOutput('status', 'failure');
        core.setOutput('message', errorMessage);
    }
}
exports.run = run;
if (require.main === module) {
    run();
}
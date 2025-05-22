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
exports.GitHubService = void 0;
const rest_1 = require("@octokit/rest");
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
class GitHubService {
    constructor(token, repository, debug = false) {
        if (!token) {
            throw new Error('Token is required');
        }
        if (!repository) {
            throw new Error('Repository is required');
        }
        this.octokit = new rest_1.Octokit({ auth: token });
        [this.owner, this.repo] = repository.split('/');
        this.debug = debug;
    }
    async getUser(username) {
        const { data: user } = await this.octokit.users.getByUsername({ username });
        return { type: 'User', id: user.id, login: user.login };
    }
    async getTeam(teamSlug) {
        const { data: team } = await this.octokit.teams.getByName({
            org: this.owner,
            team_slug: teamSlug
        });
        return { type: 'Team', id: team.id, slug: team.slug };
    }
    async hasTeamAccess(teamSlug) {
        try {
            const { data: repos } = await this.octokit.teams.listReposInOrg({
                org: this.owner,
                team_slug: teamSlug
            });
            return repos.some(repo => repo.full_name === `${this.owner}/${this.repo}`);
        }
        catch {
            return false;
        }
    }
    async resolveReviewers(environmentName, reviewers) {
        const reviewerList = [];
        const failedTeams = [];
        let existingReviewers = [];
        try {
            const existingEnv = await this.getEnvironmentConfig(environmentName);
            const protectionRules = Array.isArray(existingEnv.protection_rules)
                ? existingEnv.protection_rules
                : [];
            const requiredReviewersRule = protectionRules.find((r) => r.type === 'required_reviewers');
            const rawReviewers = requiredReviewersRule?.reviewers ?? [];
            existingReviewers = rawReviewers.map((er) => ({
                type: er.type,
                id: er.reviewer.id,
                ...(er.reviewer.login ? { login: er.reviewer.login } : {}),
                ...(er.reviewer.slug ? { slug: er.reviewer.slug } : {})
            }));
        }
        catch (error) {
            (0, utils_1.logDebug)(this.debug, `Environment ${environmentName} does not exist yet, skipping existing reviewer check`);
        }
        const isAlreadyIncluded = (r) => {
            return existingReviewers.some(er => er.type === r.type && er.id === r.id);
        };
        for (const reviewer of reviewers) {
            try {
                if (!reviewer || typeof reviewer !== 'object') {
                    core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
                    continue;
                }
                if (reviewer.type === 'User') {
                    if (!reviewer.login) {
                        core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
                        continue;
                    }
                    try {
                        const user = await this.getUser(reviewer.login);
                        reviewerList.push(user);
                        (0, utils_1.logDebug)(this.debug, `${isAlreadyIncluded(user) ? 'Skipping' : 'Adding'} user ${reviewer.login}`);
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        core.error(`Failed to process reviewer for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)} — ${errorMessage}`);
                    }
                }
                else if (reviewer.type === 'Team') {
                    if (!reviewer.slug) {
                        core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
                        continue;
                    }
                    try {
                        const team = await this.getTeam(reviewer.slug);
                        if (!team || !team.id) {
                            core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
                            continue;
                        }
                        const hasAccess = await this.hasTeamAccess(reviewer.slug);
                        if (!hasAccess) {
                            const errorMessage = `Team ${reviewer.slug} does not have access to ${this.owner}/${this.repo} repository`;
                            core.error(errorMessage);
                            failedTeams.push({ slug: reviewer.slug, error: errorMessage });
                            continue;
                        }
                        reviewerList.push(team);
                        (0, utils_1.logDebug)(this.debug, `${isAlreadyIncluded(team) ? 'Skipping' : 'Adding'} team ${reviewer.slug}`);
                    }
                    catch (error) {
                        const gitHubError = error;
                        const errorMessage = gitHubError.message || 'Unknown error';
                        if (error instanceof Error && error.message === 'API Error') {
                            core.error(`Error adding team ${reviewer.slug}: ${errorMessage}`);
                            failedTeams.push({ slug: reviewer.slug, error: errorMessage });
                        }
                        else if ((gitHubError.status && (gitHubError.status === 404 || gitHubError.status === 403)) ||
                            (errorMessage && (errorMessage.includes('does not have access') ||
                                errorMessage.includes('Not Found') ||
                                errorMessage.includes('Resource not accessible by integration') ||
                                errorMessage.includes('Not Found or access denied')))) {
                            core.error(`Error adding team ${reviewer.slug}: ${errorMessage}`);
                            failedTeams.push({ slug: reviewer.slug, error: errorMessage });
                        }
                        else {
                            throw error; // Re-throw unexpected errors
                        }
                    }
                }
                else {
                    core.error(`Invalid reviewer type for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                core.error(`Failed to process reviewer for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)} — ${errorMessage}`);
                throw error; // Re-throw unexpected errors
            }
        }
        if (failedTeams.length > 0) {
            core.error(`The following teams do not have access to ${this.owner}/${this.repo}: ${failedTeams.map(f => f.slug).join(', ')}`);
        }
        return reviewerList;
    }
    isWaitTimerRule(rule) {
        return typeof rule === 'object' && rule !== null && 'type' in rule && rule.type === 'wait_timer';
    }
    isReviewersRule(rule) {
        return typeof rule === 'object' && rule !== null && 'type' in rule && rule.type === 'required_reviewers';
    }
    isPreventSelfReviewRule(rule) {
        return typeof rule === 'object' && rule !== null && 'type' in rule && rule.type === 'prevent_self_review';
    }
    async updateEnvironment(environmentName, config) {
        const octokitConfig = {
            wait_timer: config.wait_timer ?? undefined,
            prevent_self_review: config.prevent_self_review,
            deployment_branch_policy: config.deployment_branch_policy ? {
                protected_branches: config.deployment_branch_policy.protected_branches,
                custom_branch_policies: config.deployment_branch_policy.custom_branch_policies
            } : undefined
        };
        try {
            const { data: currentConfig } = await this.octokit.repos.getEnvironment({
                owner: this.owner,
                repo: this.repo,
                environment_name: environmentName
            });
            const currentRules = currentConfig.protection_rules || [];
            const waitTimerRule = currentRules.find(r => r.type === 'wait_timer');
            const currentWaitTimer = this.isWaitTimerRule(waitTimerRule) ? waitTimerRule.wait_timer : undefined;
            const reviewersRule = currentRules.find(r => r.type === 'required_reviewers');
            const currentReviewers = this.isReviewersRule(reviewersRule) ? reviewersRule.reviewers : undefined;
            const currentPreventSelfReview = this.isReviewersRule(reviewersRule) ? reviewersRule.prevent_self_review : undefined;
            const currentBranchPolicy = currentConfig.deployment_branch_policy;
            const normalizeReviewers = (reviewers) => {
                if (!reviewers)
                    return undefined;
                return reviewers.map(r => ({
                    type: r.type,
                    id: r.reviewer?.id || r.id,
                    ...(r.type === 'User' ? { login: r.reviewer?.login || r.login } : {}),
                    ...(r.type === 'Team' ? { slug: r.reviewer?.slug || r.slug } : {})
                })).sort((a, b) => {
                    if (a.type !== b.type)
                        return a.type.localeCompare(b.type);
                    if (a.type === 'User')
                        return (a.login || '').localeCompare(b.login || '');
                    return (a.slug || '').localeCompare(b.slug || '');
                });
            };
            const normalizedCurrentReviewers = normalizeReviewers(currentReviewers);
            const normalizedDesiredReviewers = normalizeReviewers(config.reviewers);
            const hasChanges = currentWaitTimer !== octokitConfig.wait_timer ||
                JSON.stringify(normalizedCurrentReviewers) !== JSON.stringify(normalizedDesiredReviewers) ||
                currentPreventSelfReview !== octokitConfig.prevent_self_review ||
                JSON.stringify(currentBranchPolicy) !== JSON.stringify(octokitConfig.deployment_branch_policy);
            (0, utils_1.logDebug)(this.debug, `currentWaitTimer: ${currentWaitTimer}`);
            (0, utils_1.logDebug)(this.debug, `octokitConfig.wait_timer: ${octokitConfig.wait_timer}`);
            (0, utils_1.logDebug)(this.debug, `currentPreventSelfReview: ${currentPreventSelfReview}`);
            (0, utils_1.logDebug)(this.debug, `reviewersRule: ${JSON.stringify(reviewersRule, null, 2)}`);
            (0, utils_1.logDebug)(this.debug, `octokitConfig.prevent_self_review: ${octokitConfig.prevent_self_review}`);
            (0, utils_1.logDebug)(this.debug, `currentBranchPolicy: ${JSON.stringify(currentBranchPolicy, null, 2)}`);
            (0, utils_1.logDebug)(this.debug, `octokitConfig.deployment_branch_policy: ${JSON.stringify(octokitConfig.deployment_branch_policy, null, 2)}`);
            (0, utils_1.logDebug)(this.debug, `normalizedCurrentReviewers: ${JSON.stringify(normalizedCurrentReviewers, null, 2)}`);
            (0, utils_1.logDebug)(this.debug, `normalizedDesiredReviewers: ${JSON.stringify(normalizedDesiredReviewers, null, 2)}`);
            if (!hasChanges) {
                return {
                    status: 'nochange',
                    message: 'No update required: environment is up to date.'
                };
            }
            const formattedConfig = {
                ...octokitConfig,
                reviewers: config.reviewers?.map(r => ({
                    type: r.type,
                    id: r.id,
                    ...(r.type === 'User' ? { login: r.login } : {}),
                    ...(r.type === 'Team' ? { slug: r.slug } : {})
                }))
            };
            await this.octokit.repos.createOrUpdateEnvironment({
                owner: this.owner,
                repo: this.repo,
                environment_name: environmentName,
                ...formattedConfig
            });
            return {
                status: 'success',
                message: 'Update successful: environment configuration updated.'
            };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Not Found')) {
                const formattedConfig = {
                    ...octokitConfig,
                    reviewers: config.reviewers?.map(r => ({
                        type: r.type,
                        id: r.id,
                        ...(r.type === 'User' ? { login: r.login } : {}),
                        ...(r.type === 'Team' ? { slug: r.slug } : {})
                    }))
                };
                await this.octokit.repos.createOrUpdateEnvironment({
                    owner: this.owner,
                    repo: this.repo,
                    environment_name: environmentName,
                    ...formattedConfig
                });
                return {
                    status: 'success',
                    message: 'Update successful: environment created.'
                };
            }
            throw error;
        }
    }
    async getEnvironmentConfig(environmentName) {
        try {
            const { data } = await this.octokit.repos.getEnvironment({
                owner: this.owner,
                repo: this.repo,
                environment_name: environmentName
            });
            return data;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Not Found')) {
                throw error;
            }
            throw error;
        }
    }
    async deleteAnEnvironment(environmentName) {
        try {
            const { data: env } = await this.octokit.repos.getEnvironment({
                owner: this.owner,
                repo: this.repo,
                environment_name: environmentName
            });
            if (!env) {
                return {
                    status: 'nochange',
                    message: `No update required: environment '${environmentName}' does not exist.`
                };
            }
            await this.octokit.repos.deleteAnEnvironment({
                owner: this.owner,
                repo: this.repo,
                environment_name: environmentName
            });
            return {
                status: 'success',
                message: `Update successful: environment '${environmentName}' deleted.`
            };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Not Found')) {
                return {
                    status: 'nochange',
                    message: `No update required: environment '${environmentName}' does not exist.`
                };
            }
            throw error;
        }
    }
    async getAllEnvironments() {
        try {
            const { data } = await this.octokit.repos.getAllEnvironments({
                owner: this.owner,
                repo: this.repo
            });
            return (data.environments || []).map(env => env.name);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to get environments: ${errorMessage}`);
        }
    }
}
exports.GitHubService = GitHubService;

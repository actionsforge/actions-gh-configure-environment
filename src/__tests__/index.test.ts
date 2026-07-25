import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { GitHubService } from '../github';
import { run, getInputs, loadConfig } from '../index';

vi.mock('@actions/core');
vi.mock('../github');
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn()
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));
vi.mock('js-yaml');

describe('Action', () => {
  let mockGitHubService: {
    getAllEnvironments: Mock<(...args: any[]) => any>;
    getEnvironmentConfig: Mock<(...args: any[]) => any>;
    updateEnvironment: Mock<(...args: any[]) => any>;
    deleteAnEnvironment: Mock<(...args: any[]) => any>;
    getUser: Mock<(...args: any[]) => any>;
    getTeam: Mock<(...args: any[]) => any>;
    resolveReviewers: Mock<(...args: any[]) => any>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_TOKEN = 'test-token';

    (core.getInput as Mock<(...args: any[]) => any>).mockImplementation((name: string) => {
      switch (name) {
        case 'token':
          return 'test-token';
        case 'config-path':
          return '.github/environments.yaml';
        case 'dry-run':
          return 'false';
        case 'debug':
          return 'true';
        default:
          return '';
      }
    });

    mockGitHubService = {
      getAllEnvironments: vi.fn().mockResolvedValue(['test-env']),
      getEnvironmentConfig: vi.fn().mockResolvedValue({
        protection_rules: [],
        reviewers: [],
        prevent_self_review: false,
        deployment_branch_policy: { protected_branches: true, custom_branch_policies: false }
      }),
      updateEnvironment: vi.fn().mockResolvedValue({ status: 'success', message: 'Updated' }),
      deleteAnEnvironment: vi.fn().mockResolvedValue({ status: 'success', message: 'Deleted' }),
      getUser: vi.fn().mockResolvedValue({ type: 'User', id: 123, login: 'testuser' }),
      getTeam: vi.fn().mockResolvedValue({ type: 'Team', id: 456, slug: 'testteam' }),
      resolveReviewers: vi.fn().mockImplementation(async (envName: string, reviewers: Array<{ type: 'User' | 'Team'; login?: string; slug?: string }>) => {
        const resolvedReviewers: Array<{ type: 'User' | 'Team'; id?: number; login?: string; slug?: string }> = [];
        for (const reviewer of reviewers) {
          if (reviewer.type === 'User') {
            const user = await mockGitHubService.getUser(reviewer.login!);
            resolvedReviewers.push(user);
          } else if (reviewer.type === 'Team') {
            const team = await mockGitHubService.getTeam(reviewer.slug!);
            resolvedReviewers.push(team);
          }
        }
        return resolvedReviewers;
      })
    };
    (GitHubService as unknown as Mock<(...args: any[]) => any>).mockImplementation(function () {
      return mockGitHubService;
    });

    const mockConfig = {
      environments: {
        'test-env': {
          wait_timer: 30,
          reviewers: [
            { type: 'User', login: 'testuser' },
            { type: 'Team', slug: 'testteam' }
          ],
          prevent_self_review: true,
          deployment_branch_policy: {
            protected_branches: true,
            custom_branch_policies: false
          }
        }
      }
    };
    (fs.readFileSync as Mock<(...args: any[]) => any>).mockReturnValue('mock yaml content');
    (yaml.load as Mock<(...args: any[]) => any>).mockReturnValue(mockConfig);
  });

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_TOKEN;
  });

  describe('run', () => {
    it('should handle successful environment update', async () => {
      await run();
      expect(mockGitHubService.updateEnvironment).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
      expect(core.setOutput).toHaveBeenCalledWith('message', 'All environments configured successfully');
    });

    it('should handle environment deletion', async () => {
      mockGitHubService.getAllEnvironments.mockResolvedValue(['old-env']);
      await run();
      expect(mockGitHubService.deleteAnEnvironment).toHaveBeenCalledWith('old-env');
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Found 1 environments to delete: old-env'));
    });

    it('should handle error in getAllEnvironments', async () => {
      mockGitHubService.getAllEnvironments.mockRejectedValue(new Error('Failed to get environments'));
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('Failed to get environments');
    });

    it('should handle error in deleteAnEnvironment', async () => {
      mockGitHubService.getAllEnvironments.mockResolvedValue(['old-env']);
      mockGitHubService.deleteAnEnvironment.mockRejectedValue(new Error('Failed to delete environment'));
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('Failed to delete environment');
    });

    it('should handle missing environments in config', async () => {
      const mockConfig = { environments: {} };
      (fs.readFileSync as Mock<(...args: any[]) => any>).mockReturnValue('environments: {}');
      (yaml.load as Mock<(...args: any[]) => any>).mockReturnValue(mockConfig);
      mockGitHubService.getAllEnvironments.mockResolvedValue(['env1', 'env2']);

      await run();

      expect(mockGitHubService.deleteAnEnvironment).toHaveBeenCalledWith('env1');
      expect(mockGitHubService.deleteAnEnvironment).toHaveBeenCalledWith('env2');
      expect(core.info).toHaveBeenCalledWith('Found 2 environments to delete: env1, env2');
    });

    it('should handle invalid YAML config', async () => {
      (yaml.load as Mock<(...args: any[]) => any>).mockImplementation(() => {
        throw new Error('Invalid YAML');
      });
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('Failed to load config from .github/environments.yaml: Invalid YAML');
    });

    it('should handle missing GITHUB_REPOSITORY', async () => {
      delete process.env.GITHUB_REPOSITORY;
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('GITHUB_REPOSITORY environment variable is required');
    });

    it('should skip environment update in dry-run mode', async () => {
      (core.getInput as Mock<(...args: any[]) => any>).mockImplementation((name: string) => {
        if (name === 'dry-run') return 'true';
        if (name === 'token') return 'test-token';
        if (name === 'config-path') return '.github/environments.yaml';
        if (name === 'debug') return 'true';
        return '';
      });

      await run();

      expect(core.info).toHaveBeenCalledWith('[DRY RUN] Would update environment test-env');
      expect(mockGitHubService.updateEnvironment).not.toHaveBeenCalled();
    });
  });

  describe('processReviewers', () => {
    it('should process reviewers successfully', async () => {
      await run();
      expect(mockGitHubService.getUser).toHaveBeenCalledWith('testuser');
      expect(mockGitHubService.getTeam).toHaveBeenCalledWith('testteam');
      expect(mockGitHubService.updateEnvironment).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
    });

    it('should handle empty reviewers list', async () => {
      (yaml.load as Mock<(...args: any[]) => any>).mockReturnValue({
        environments: {
          'test-env': {
            wait_timer: 30,
            reviewers: [],
            prevent_self_review: true,
            deployment_branch_policy: {
              protected_branches: true,
              custom_branch_policies: false
            }
          }
        }
      });
      await run();
      expect(mockGitHubService.updateEnvironment).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
    });

    it('should handle missing reviewers in config', async () => {
      (yaml.load as Mock<(...args: any[]) => any>).mockReturnValue({
        environments: {
          'test-env': {
            wait_timer: 30,
            prevent_self_review: true,
            deployment_branch_policy: {
              protected_branches: true,
              custom_branch_policies: false
            }
          }
        }
      });
      await run();
      expect(mockGitHubService.updateEnvironment).toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
    });
  });
});

describe('Input handling', () => {
  it('should throw error when no token is provided', async () => {
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'token') return '';
      return '';
    });
    delete process.env.GH_ENV_CONFIG_TOKEN;
    await expect(getInputs()).rejects.toThrow('No token provided');
  });

  it('should use environment variable token when input token is not provided', async () => {
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'token') return '';
      return '';
    });
    process.env.GH_ENV_CONFIG_TOKEN = 'env-token';
    const inputs = await getInputs();
    expect(inputs.token).toBe('env-token');
  });

  it('should handle missing environments key in config', async () => {
    const mockConfig = {};
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    vi.spyOn(yaml, 'load').mockReturnValue(mockConfig);
    await expect(loadConfig('test.yaml')).rejects.toThrow('Invalid configuration: missing "environments" key');
  });

  it('should handle empty environments array in config', async () => {
    const mockConfig = { environments: [] };
    vi.spyOn(fs, 'readFileSync').mockReturnValue('environments: []');
    vi.spyOn(yaml, 'load').mockReturnValue(mockConfig);
    const config = await loadConfig('test.yaml');
    expect(config.environments).toEqual({});
  });
});

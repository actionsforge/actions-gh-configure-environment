import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { GitHubService } from '../github';
import { run, getInputs, loadConfig } from '../index';

jest.mock('@actions/core');
jest.mock('../github');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    access: jest.fn(),
    readFile: jest.fn()
  },
  readFileSync: jest.fn()
}));
jest.mock('js-yaml');

describe('Action', () => {
  let mockGitHubService: jest.Mocked<GitHubService>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_TOKEN = 'test-token';

    (core.getInput as jest.Mock).mockImplementation((name: string) => {
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
      getAllEnvironments: jest.fn().mockResolvedValue(['test-env']),
      getEnvironmentConfig: jest.fn().mockResolvedValue({
        protection_rules: [],
        reviewers: [],
        prevent_self_review: false,
        deployment_branch_policy: { protected_branches: true, custom_branch_policies: false }
      }),
      updateEnvironment: jest.fn().mockResolvedValue({ status: 'success', message: 'Updated' }),
      deleteAnEnvironment: jest.fn().mockResolvedValue({ status: 'success', message: 'Deleted' }),
      getUser: jest.fn().mockResolvedValue({ type: 'User', id: 123, login: 'testuser' }),
      getTeam: jest.fn().mockResolvedValue({ type: 'Team', id: 456, slug: 'testteam' }),
      resolveReviewers: jest.fn().mockImplementation(async (envName: string, reviewers: Array<{ type: 'User' | 'Team'; login?: string; slug?: string }>) => {
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
    } as unknown as jest.Mocked<GitHubService>;
    (GitHubService as jest.Mock).mockImplementation(() => mockGitHubService);

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
    (fs.readFileSync as jest.Mock).mockReturnValue('mock yaml content');
    (yaml.load as jest.Mock).mockReturnValue(mockConfig);
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
      (fs.readFileSync as jest.Mock).mockReturnValue('environments: {}');
      (yaml.load as jest.Mock).mockReturnValue(mockConfig);
      mockGitHubService.getAllEnvironments.mockResolvedValue(['env1', 'env2']);

      await run();

      expect(mockGitHubService.deleteAnEnvironment).toHaveBeenCalledWith('env1');
      expect(mockGitHubService.deleteAnEnvironment).toHaveBeenCalledWith('env2');
      expect(core.info).toHaveBeenCalledWith('Found 2 environments to delete: env1, env2');
    });

    it('should handle invalid YAML config', async () => {
      (yaml.load as jest.Mock).mockImplementation(() => {
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
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
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
      (yaml.load as jest.Mock).mockReturnValue({
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
      (yaml.load as jest.Mock).mockReturnValue({
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
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'token') return '';
      return '';
    });
    delete process.env.GH_ENV_CONFIG_TOKEN;
    await expect(getInputs()).rejects.toThrow('No token provided');
  });

  it('should use environment variable token when input token is not provided', async () => {
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'token') return '';
      return '';
    });
    process.env.GH_ENV_CONFIG_TOKEN = 'env-token';
    const inputs = await getInputs();
    expect(inputs.token).toBe('env-token');
  });

  it('should handle missing environments key in config', async () => {
    const mockConfig = {};
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    jest.spyOn(yaml, 'load').mockReturnValue(mockConfig);
    await expect(loadConfig('test.yaml')).rejects.toThrow('Invalid configuration: missing "environments" key');
  });

  it('should handle empty environments array in config', async () => {
    const mockConfig = { environments: [] };
    jest.spyOn(fs, 'readFileSync').mockReturnValue('environments: []');
    jest.spyOn(yaml, 'load').mockReturnValue(mockConfig);
    const config = await loadConfig('test.yaml');
    expect(config.environments).toEqual({});
  });
});

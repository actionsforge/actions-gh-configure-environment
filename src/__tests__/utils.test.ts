import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from '../github';
import { processReviewers } from '../utils';
import { Octokit } from '@octokit/rest';

vi.mock('../github');

describe('Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processReviewers', () => {
    let mockGithub: GitHubService;

    beforeEach(() => {
      mockGithub = {
        getUser: vi.fn(),
        getTeam: vi.fn(),
        owner: 'owner',
        repo: 'repo',
        debug: false,
        getAllEnvironments: vi.fn(),
        getEnvironmentConfig: vi.fn(),
        updateEnvironment: vi.fn(),
        deleteAnEnvironment: vi.fn(),
        resolveReviewers: vi.fn(),
        hasTeamAccess: vi.fn(),
        octokit: {} as Octokit
      } as unknown as GitHubService;
    });

    describe('valid inputs', () => {
      it('should process user reviewers', async () => {
        (mockGithub.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'User', id: 123, login: 'testuser' });

        const result = await processReviewers('user:testuser', mockGithub);

        expect(mockGithub.getUser).toHaveBeenCalledWith('testuser');
        expect(result).toEqual([{ type: 'User', id: 123, login: 'testuser' }]);
      });

      it('should process team reviewers', async () => {
        (mockGithub.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'Team', id: 456, slug: 'testteam' });

        const result = await processReviewers('team:testteam', mockGithub);

        expect(mockGithub.getTeam).toHaveBeenCalledWith('testteam');
        expect(result).toEqual([{ type: 'Team', id: 456, slug: 'testteam' }]);
      });

      it('should process multiple reviewers', async () => {
        (mockGithub.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'User', id: 123, login: 'testuser' });
        (mockGithub.getTeam as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'Team', id: 456, slug: 'testteam' });

        const result = await processReviewers('user:testuser,team:testteam', mockGithub);

        expect(mockGithub.getUser).toHaveBeenCalledWith('testuser');
        expect(mockGithub.getTeam).toHaveBeenCalledWith('testteam');
        expect(result).toEqual([
          { type: 'User', id: 123, login: 'testuser' },
          { type: 'Team', id: 456, slug: 'testteam' }
        ]);
      });
    });

    describe('invalid inputs', () => {
      it('should handle empty reviewers string', async () => {
        const result = await processReviewers('', mockGithub);
        expect(result).toEqual([]);
        expect(mockGithub.getUser).not.toHaveBeenCalled();
        expect(mockGithub.getTeam).not.toHaveBeenCalled();
      });

      it('should handle invalid reviewer format', async () => {
        const result = await processReviewers('invalid:format', mockGithub);
        expect(result).toEqual([]);
        expect(mockGithub.getUser).not.toHaveBeenCalled();
        expect(mockGithub.getTeam).not.toHaveBeenCalled();
      });
    });
  });
});

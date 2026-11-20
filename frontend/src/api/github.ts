import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

/** docs/API.md, GitHub → daily dev drafts (FR-14). */
export type GitHubFrequency = 'daily' | 'weekly' | 'highlights'

export type GitHubRepo = { id: string; full_name: string; private: boolean; mention_ok: boolean }

export type GitHubDigest = {
  id: string
  day: string
  kind: 'daily' | 'weekly'
  status: 'nothing' | 'suggested' | 'skipped'
  score: number
  reason: string
  angle: string | null
  thread_id: string | null
  based_on: string[]
}

export type GitHubStatus = {
  enabled: boolean
  private_enabled: boolean
  connected: boolean
  login: string | null
  private_repos: boolean
  frequency: GitHubFrequency
  repos: GitHubRepo[]
  digests: GitHubDigest[]
}

const KEY = ['github']

export function useGitHub() {
  return useQuery({ queryKey: KEY, queryFn: () => api<GitHubStatus>('/github') })
}

function useGitHubMutation<T>(fn: (arg: T) => Promise<GitHubStatus | null>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (status) => {
      if (status) client.setQueryData(KEY, status)
      else void client.invalidateQueries({ queryKey: KEY })
      void client.invalidateQueries({ queryKey: ['threads'] })
    },
  })
}

/** POST /github/connect or /github/install: where to send the browser next. */
export async function githubLink(kind: 'connect' | 'install'): Promise<string> {
  return (await api<{ url: string }>(`/github/${kind}`, { method: 'POST' })).url
}

export const useFinishConnect = () =>
  useGitHubMutation((body: { code: string; state: string }) =>
    api<GitHubStatus>('/github/callback', json('POST', body)),
  )

export const useFinishInstall = () =>
  useGitHubMutation((body: { installation_id: number; state: string }) =>
    api<GitHubStatus>('/github/installation', json('POST', body)),
  )

export const useSetMention = () =>
  useGitHubMutation(({ id, mention_ok }: { id: string; mention_ok: boolean }) =>
    api<GitHubStatus>(`/github/repos/${id}`, json('PATCH', { mention_ok })),
  )

export const useSetFrequency = () =>
  useGitHubMutation((frequency: GitHubFrequency) =>
    api<GitHubStatus>('/github/settings', json('PUT', { frequency })),
  )

export const usePostAnyway = () =>
  useGitHubMutation((digestId: string) =>
    api<GitHubStatus>(`/github/digests/${digestId}/draft`, { method: 'POST' }),
  )

export const useDisconnectGitHub = () =>
  useGitHubMutation(() => api<null>('/github', { method: 'DELETE' }))

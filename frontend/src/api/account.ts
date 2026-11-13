import { apiFetch } from './client';

export function updateAccountProfile(displayName: string): Promise<Response> {
  return apiFetch('/account/profile', {
    method: 'PATCH',
    body: { display_name: displayName },
  });
}

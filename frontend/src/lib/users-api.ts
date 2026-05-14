import { api } from './api';

export async function getEditors() {
  const { data } = await api.get('/users/editors');
  return data;
}

import { getUserToken } from "../../functions";

export const getAuthHeaders = async () => {
  const token = await getUserToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};
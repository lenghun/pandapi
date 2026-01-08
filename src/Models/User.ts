import { z } from "zod";

export const user = z.object({
    id: z.number().int(),
    userName: z.string(),
    nickName: z.string(),
    password: z.string(),
    avatar: z.string(),
    email: z.string(),
    inviteUser: z.string(),
    isAdmin: z.boolean()
});


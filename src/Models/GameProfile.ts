import { z } from "zod";

export const GameProfile = z.object({
    Id: z.number().int(),
    UserId: z.number(),
    Bindkey: z.string(),
    Game: z.string(),
    Data: z.any(),
});


export const GameType = z.object({
    Name: z.string(),
});
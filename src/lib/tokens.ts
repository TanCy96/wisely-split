import { nanoid } from "nanoid";

export const generateToken = (): string => nanoid(22);

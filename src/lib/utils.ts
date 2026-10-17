import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Result of a Server Action shown by a form: a message, never raw database errors. */
export type ActionState = { error?: string; ok?: string } | undefined;

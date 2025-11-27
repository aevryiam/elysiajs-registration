import { t } from "elysia";

export const signUpSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8 }),
  nama: t.String({ minLength: 2 }),
  nomorTelepon: t.Optional(t.String()),
  namaLengkap: t.Optional(t.String()),
});

export const signInSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String(),
});

export const updateProfileSchema = t.Object({
  nama: t.Optional(t.String({ minLength: 2 })),
  namaLengkap: t.Optional(t.String()),
  nomorTelepon: t.Optional(t.String()),
  photo: t.Optional(t.String()),
});

export const changePasswordSchema = t.Object({
  oldPassword: t.String(),
  newPassword: t.String({ minLength: 8 }),
});

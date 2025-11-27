export const successResponse = <T>(data: T, message = "Success") => ({
  success: true,
  message,
  data,
});

export const errorResponse = (message: string, errors?: any) => ({
  success: false,
  message,
  errors,
});

export const paginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
) => ({
  success: true,
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});

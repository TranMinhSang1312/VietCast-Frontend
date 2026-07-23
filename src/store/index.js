import { configureStore } from "@reduxjs/toolkit";
import dubbingReducer from "./slices/dubbingSlice";
import authReducer from "./slices/authSlice";

export const store = configureStore({
  reducer: {
    dubbing: dubbingReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;

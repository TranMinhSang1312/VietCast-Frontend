import { configureStore } from "@reduxjs/toolkit";
import dubbingReducer from "./slices/dubbingSlice";
import authReducer from "./slices/authSlice";
import delogoReducer from "./slices/delogoSlice";

export const store = configureStore({
  reducer: {
    dubbing: dubbingReducer,
    auth: authReducer,
    delogo: delogoReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;

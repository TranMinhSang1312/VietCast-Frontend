import { configureStore } from "@reduxjs/toolkit";
import dubbingReducer from "./slices/dubbingSlice";

export const store = configureStore({
  reducer: {
    dubbing: dubbingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;

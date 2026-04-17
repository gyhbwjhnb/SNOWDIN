import { createBrowserRouter } from "react-router-dom";
import { App } from "../App";
import { Terminal } from "../components/Terminal";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <Terminal />,
      },
    ],
  },
]);

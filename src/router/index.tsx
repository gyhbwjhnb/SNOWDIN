import { createBrowserRouter } from "react-router-dom";
import { App } from "../App";
import { Terminal } from "../components/Terminal";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/terminal",
    element: (
      <div className="viewer">
        <div className="embedded-screen">
          <div className="embedded-screen-inner is-interactive">
            <Terminal interactive />
          </div>
        </div>
      </div>
    ),
  },
]);

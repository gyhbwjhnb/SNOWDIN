import { Terminal } from "./components/Terminal";

export function App() {
  return (
    <div className="min-h-screen bg-neutral-800 text-amber-50">
      <div className="h-screen w-full px-2 py-2 sm:px-3 sm:py-3">
        <Terminal />
      </div>
    </div>
  );
}

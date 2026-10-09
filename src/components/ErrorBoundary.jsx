import { Component } from "react";

// Vite/React.lazy loads each route as its own hashed JS chunk. A redeploy
// replaces those files, so a tab that was opened before the deploy holds an
// index.html that points at chunks which no longer exist - clicking another
// route then fails and the screen goes blank. Reloading once fetches the fresh
// index and chunks; the sessionStorage flag stops a reload loop if a chunk is
// genuinely missing.
function isStaleChunkError(message) {
  return /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk|Failed to fetch dynamically/i.test(message);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = String((error && error.message) || error);
    if (isStaleChunkError(message) && !sessionStorage.getItem("hisab_chunk_reload")) {
      sessionStorage.setItem("hisab_chunk_reload", "1");
      window.location.reload();
    }

    return (
      <div className="text-center py-16 px-4">
        <i className="fa-solid fa-triangle-exclamation text-3xl text-amber-500 mb-3"></i>
        <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">
          পেজটি লোড করা যায়নি
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">
          অ্যাপে নতুন আপডেট হয়েছে। একবার রিফ্রেশ করুন।
        </div>
        <button
          onClick={this.handleReload}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs"
        >
          <i className="fa-solid fa-rotate-right me-1.5"></i> রিফ্রেশ করুন
        </button>
      </div>
    );
  }
}

"use client";

import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black min-h-screen text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex w-full max-w-4xl flex-col items-center justify-center text-center px-6"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-8 p-4 rounded-full bg-zinc-200 dark:bg-zinc-800"
        >
          <span className="text-sm font-semibold tracking-wide uppercase">
            Resume Builder Pro
          </span>
        </motion.div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Craft Your Perfect <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600">
            Resume in Minutes
          </span>
        </h1>

        <p className="max-w-2xl text-lg md:text-xl leading-relaxed text-zinc-600 dark:text-zinc-400 mb-10">
          Build beautifully designed, AI-powered resumes with dynamic templates, live preview, and complete undo history. Stand out and land your dream job.
        </p>

        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <button className="h-12 px-8 rounded-full bg-black text-white dark:bg-white dark:text-black font-medium transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200">
            Get Started
          </button>
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-12 px-8 rounded-full border border-zinc-300 dark:border-zinc-700 font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Toggle {theme === "dark" ? "Light" : "Dark"} Mode
            </button>
          )}
        </motion.div>
      </motion.main>
    </div>
  );
}

//! Parallel execution utilities using Rayon thread pool.
//! Used for batch operations: export, index, encrypt, analysis.

use rayon::prelude::*;

/// Run a function on each item in parallel and collect results.
pub fn parallel_map<T, R, F>(items: Vec<T>, f: F) -> Vec<R>
where
    T: Send,
    R: Send,
    F: Fn(T) -> R + Send + Sync,
{
    items.into_par_iter().map(f).collect()
}

/// Run a function on each item in parallel (fire-and-forget, no results).
pub fn parallel_for_each<T, F>(items: Vec<T>, f: F)
where
    T: Send,
    F: Fn(T) + Send + Sync,
{
    items.into_par_iter().for_each(f);
}

/// Run N closures in parallel and collect results.
pub fn parallel_join_all<T, F>(tasks: Vec<F>) -> Vec<T>
where
    T: Send,
    F: FnOnce() -> T + Send,
{
    tasks.into_par_iter().map(|t| t()).collect()
}

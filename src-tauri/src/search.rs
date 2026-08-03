use ignore::WalkBuilder;
use regex::Regex;
use std::sync::mpsc;
use tauri::command;

#[derive(serde::Serialize)]
pub struct SearchResult {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
}

#[command]
pub async fn tilder_search_workspace(workspace_path: String, query: String, is_case_sensitive: bool, is_regex: bool) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();

    let pattern = if is_regex {
        query.clone()
    } else {
        regex::escape(&query)
    };

    let regex = match Regex::new(&if is_case_sensitive {
        pattern
    } else {
        format!("(?i){}", pattern)
    }) {
        Ok(r) => r,
        Err(e) => return Err(format!("Invalid regex: {}", e)),
    };

    let (tx, rx) = mpsc::channel();

    let walker = WalkBuilder::new(&workspace_path)
        .hidden(true)
        .git_ignore(true)
        .build_parallel();

    walker.run(|| {
        let tx = tx.clone();
        let regex = regex.clone();
        Box::new(move |result| {
            if let Ok(entry) = result {
                if entry.file_type().map_or(false, |ft| ft.is_file()) {
                    let path = entry.path();
                    if let Ok(content) = std::fs::read_to_string(path) {
                        for (i, line) in content.lines().enumerate() {
                            if regex.is_match(line) {
                                let _ = tx.send(SearchResult {
                                    file_path: path.to_string_lossy().into_owned(),
                                    line_number: i + 1,
                                    line_content: line.trim().to_string(),
                                });
                            }
                        }
                    }
                }
            }
            ignore::WalkState::Continue
        })
    });

    drop(tx);

    for res in rx {
        results.push(res);
        if results.len() >= 2000 {
            break;
        }
    }

    Ok(results)
}

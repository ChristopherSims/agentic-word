//! Smart formatting rules for document text.
//! Normalizes whitespace, quotes, dashes, and heading hierarchy.

/// Apply smart formatting rules to text.
/// Returns the formatted string with normalized characters and whitespace.
pub fn apply_smart_formatting(text: &str) -> String {
    let mut result = text.to_string();

    // 1. Normalize multiple spaces to single space
    result = result.split_whitespace().collect::<Vec<_>>().join(" ");

    // 2. Smart quotes — opening
    result = replace_smart_quotes(&result);

    // 3. Em dashes
    result = replace_em_dashes(&result);

    // 4. En dashes
    result = replace_en_dashes(&result);

    // 5. Remove spaces before punctuation
    result = remove_spaces_before_punctuation(&result);

    // 6. Ensure single space after punctuation
    result = ensure_space_after_punctuation(&result);

    // 7. Normalize multiple newlines
    result = normalize_newlines(&result);

    result
}

fn replace_smart_quotes(text: &str) -> String {
    let mut result = String::new();
    let mut in_quote = false;
    let chars: Vec<char> = text.chars().collect();

    for i in 0..chars.len() {
        if chars[i] == '"' || chars[i] == '\u{201c}' || chars[i] == '\u{201d}' {
            if !in_quote {
                result.push('\u{201c}'); // opening double quote
            } else {
                result.push('\u{201d}'); // closing double quote
            }
            in_quote = !in_quote;
        } else if chars[i] == '\'' || chars[i] == '\u{2018}' || chars[i] == '\u{2019}' {
            if !in_quote {
                result.push('\u{2018}'); // opening single quote
            } else {
                result.push('\u{2019}'); // closing single quote
            }
            in_quote = !in_quote;
        } else {
            result.push(chars[i]);
        }
    }
    result
}

fn replace_em_dashes(text: &str) -> String {
    // Replace -- (two hyphens) and --- (three hyphens) with em dash
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '-' && chars[i+1] == '-' {
            result.push('\u{2014}'); // em dash
            i += 2;
            // Skip third hyphen if present
            if i < chars.len() && chars[i] == '-' {
                i += 1;
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

fn replace_en_dashes(text: &str) -> String {
    // Replace single hyphen between numbers with en dash
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if i > 0 && i + 1 < chars.len()
            && chars[i] == '-'
            && chars[i-1].is_ascii_digit()
            && chars[i+1].is_ascii_digit()
        {
            result.push('\u{2013}'); // en dash
            i += 1;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

fn remove_spaces_before_punctuation(text: &str) -> String {
    let mut result = text.to_string();
    for punct in &[",", ".", "!", "?", ";", ":"] {
        result = result.replace(&format!(" {}", punct), punct);
    }
    result
}

fn ensure_space_after_punctuation(text: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        result.push(chars[i]);
        if matches!(chars[i], '.' | '!' | '?' | ';' | ':') {
            if i + 1 < chars.len()
                && chars[i+1] != ' '
                && chars[i+1] != '\n'
                && !chars[i+1].is_ascii_punctuation()
            {
                result.push(' ');
            }
        }
        i += 1;
    }
    result
}

fn normalize_newlines(text: &str) -> String {
    let mut result = text.to_string();

    // Collapse more than 2 consecutive newlines
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smart_quotes() {
        let result = replace_smart_quotes("He said \"hello\"");
        assert!(result.contains('\u{201c}'));
        assert!(result.contains('\u{201d}'));
    }

    #[test]
    fn test_em_dash() {
        let result = replace_em_dashes("hello--world");
        assert!(result.contains('\u{2014}'));
    }

    #[test]
    fn test_single_spaces() {
        let result = apply_smart_formatting("hello    world");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_remove_spaces_before_punct() {
        let result = remove_spaces_before_punctuation("hello , world");
        assert_eq!(result, "hello, world");
    }
}

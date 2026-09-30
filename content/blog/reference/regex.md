---
title: "RegEx"
date: "2023-10-21T23:27:29-04:00"
description: "Regular Expressions, often abbreviated as Regex or RegExp, are a powerful and flexible tool for searching, matching, and manipulating text based on patterns."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Regular Expressions (Regex)

Regular Expressions, often abbreviated as Regex or RegExp, are a powerful and flexible tool for searching, matching, and manipulating text based on patterns. They are widely used in programming, text processing, and data validation tasks. Here's an overview of Regex, what it's used for, and its syntax:

### What is Regex?

A Regular Expression is a sequence of characters that defines a search pattern. It provides a concise and flexible means of identifying and extracting specific patterns or substrings within text data. Regex is not tied to any particular programming language but is available in many programming languages, including JavaScript, Python, Java, and more.

### What is it Used For?

Regex serves a variety of purposes in software development and text processing:

**Pattern Matching:** Regex allows you to find and match specific patterns in text, such as email addresses, phone numbers, dates, or any custom pattern you define.

**Validation:** It's commonly used for input validation, ensuring that user-provided data adheres to a specific format or structure, like validating an email address or password strength.

**Search and Replace:** Regex enables you to search for patterns in text and replace them with other content. This is useful for text transformations and formatting.

**Data Extraction:** You can use Regex to extract specific information from a larger text, such as parsing log files, extracting data from HTML or XML documents, or scraping information from websites.

**Text Parsing:** Regex helps in parsing structured data like CSV files or config files by defining rules for extracting relevant information.

### Regex Syntax:

Regex patterns are composed of a combination of regular characters and special metacharacters that have specific meanings. Here are some common elements of Regex syntax:

**Literals:** Regular characters like letters, digits, and symbols match themselves. For example, the pattern abc matches the string "abc" exactly.

**Metacharacters:** Special characters with predefined meanings. Examples include:

- `.` (dot): Matches any single character except a newline.
- `*`: Matches zero or more occurrences of the preceding character or group.
- `+`: Matches one or more occurrences of the preceding character or group.
- `?`: Matches zero or one occurrence of the preceding character or group.
- `|`: Acts as an OR operator, allowing you to specify multiple alternatives.
- `()`: Defines a capturing group, allowing you to extract matched portions of the text.

**Character Classes:** Square brackets `[...]` define a character class, which matches any single character from the enclosed set. For example, `[aeiou]` matches any vowel.

**Quantifiers:** Specify how many times a character or group should appear. Examples include {3} (exactly 3 times), {2,4} (2 to 4 times), and {2,} (at least 2 times).

**Anchors:** Anchors are used to specify where a match should occur within the text. ^ anchors to the start, and $ anchors to the end.

**Escape Sequences:** You can escape metacharacters to match them literally. For instance, \[ matches an open square bracket.

**Modifiers:** Flags like `i` (case-insensitive), `g` (global), and `m` (multi-line) modify how the pattern is applied.

### Example:

Regex Pattern: `/^\d{3}-\d{2}-\d{4}$/`

Explanation:

- `^`: Anchors the match at the start of the string.
- `\d`: Matches any digit (0-9).
- `{3}`: Specifies that exactly three digits should be matched.
- `-: Matches a hyphen character.
- `{2}`: Specifies that exactly two digits should be matched.
- `-: Matches another hyphen.
- `{4}`: Specifies that exactly four digits should be matched.
- `$`: Anchors the match at the end of the string.

This pattern can be used to validate a Social Security Number (SSN) in the format 123-45-6789.

Regex is a versatile tool, but it can be complex due to its extensive syntax. However, with practice and the right resources, you can become proficient in using Regex to handle a wide range of text-processing tasks in your programming projects.

### Common RegEx Patterns

| Purpose                                   | Pattern                           |
|-------------------------------------------|----------------------------------|
| Match an email address                    | `^[\w\.-]+@[\w\.-]+\.\w+$`       |
| Match a URL                               | `^(http|https|ftp):\/\/[^\s/$.?#].[^\s]*$` |
| Match a date (YYYY-MM-DD)                 | `^\d{4}-\d{2}-\d{2}$`            |
| Match a time (HH:MM)                      | `^([0-1][0-9]|2[0-3]):[0-5][0-9]$` |
| Match a phone number (North America)       | `^\d{3}-\d{3}-\d{4}$`            |
| Match an IP address (IPv4)                | `^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$` |
| Match a username (alphanumeric + underscores) | `^[a-zA-Z0-9_]+$`               |
| Match a ZIP code (US)                     | `^\d{5}(-\d{4})?$`               |
| Match an HTML tag                         | `^<([a-z]+)([^<]+)*(?:>(.*)<\/\1>|\s+\/>)$` |
| Match a hexadecimal color code            | `^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$` |

## Using RegEx with Different Languages

### JavaScript:
JavaScript provides built-in support for Regular Expressions through the RegExp object and regular expression literals. Here's how you can use Regex in JavaScript:

```javascript
// Using a regular expression literal
const pattern = /^\d{3}-\d{2}-\d{4}$/;
const ssn = "123-45-6789";
const isValidSSN = pattern.test(ssn);

// Using the RegExp object
const regex = new RegExp("^\\d{3}-\\d{2}-\\d{4}$");
const isValidSSN2 = regex.test(ssn);

// Match and extract
const text = "My email is john@example.com";
const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/;
const matchedEmail = text.match(emailPattern);
```

### Python:
Python provides Regex support through the re module. Here's how you can use Regex in Python:

```python
import re

# Using re.match for simple matching
pattern = r"^\d{3}-\d{2}-\d{4}$"
ssn = "123-45-6789"
is_valid_ssn = re.match(pattern, ssn)

# Using re.search for finding patterns
text = "My email is john@example.com"
email_pattern = r"[\w\.-]+@[\w\.-]+\.\w+"
matched_email = re.search(email_pattern, text)

# Extracting matched content
if matched_email:
    email = matched_email.group()
```

### Ruby:
Ruby provides built-in support for Regex using the =~ operator or the match method. Here's how you can use Regex in Ruby:

```ruby
# Using the =~ operator
pattern = /^\d{3}-\d{2}-\d{4}$/
ssn = "123-45-6789"
is_valid_ssn = ssn =~ pattern

# Using the match method
text = "My email is john@example.com"
email_pattern = /[\w\.-]+@[\w\.-]+\.\w+/
matched_email = text.match(email_pattern)

# Extracting matched content
if matched_email
  email = matched_email[0]
end
```

### PHP

```php
// Using preg_match for simple matching
$pattern = '/^\d{3}-\d{2}-\d{4}$/';
$ssn = "123-45-6789";
$is_valid_ssn = preg_match($pattern, $ssn);

// Using preg_match_all for finding patterns
$text = "My email is john@example.com and jane@example.com";
$email_pattern = '/[\w\.-]+@[\w\.-]+\.\w+/';
preg_match_all($email_pattern, $text, $matched_emails);

// Extracting matched content
if ($is_valid_ssn) {
    echo "Valid SSN: $ssn";
}

if (!empty($matched_emails[0])) {
    foreach ($matched_emails[0] as $email) {
        echo "Matched Email: $email";
    }
}
```
In PHP, you enclose your regular expression patterns in forward slashes /.../. The preg_match function is used for simple matching, while preg_match_all is used to find multiple instances of a pattern in the text. You can use capturing groups to extract specific parts of a matched string.

PHP's regex functions provide a wide range of options and flags for performing case-insensitive matches, multiline matches, and more. Additionally, PHP offers functions like preg_replace for replacing matched patterns in strings.

### Go:
Go provides Regex support through the regexp package. Here's how you can use Regex in Go:

```go
import (
	"regexp"
)

func main() {
	// Using regexp.MatchString for simple matching
	pattern := `^\d{3}-\d{2}-\d{4}$`
	ssn := "123-45-6789"
	isValidSSN, _ := regexp.MatchString(pattern, ssn)

	// Using regexp.MustCompile for compiling patterns
	text := "My email is john@example.com"
	emailPattern := `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
	r := regexp.MustCompile(emailPattern)
	matchedEmail := r.FindString(text)
}
```

### Rust:
In Rust, you can use the regex crate for Regex operations. First, add the crate to your Cargo.toml:

```toml
[dependencies]
regex = "1.4"
```

Here's how you can use Regex in Rust:

```rust
extern crate regex;

use regex::Regex;

fn main() {
    // Using Regex::is_match for simple matching
    let pattern = r"^\d{3}-\d{2}-\d{4}$";
    let ssn = "123-45-6789";
    let is_valid_ssn = Regex::new(pattern).unwrap().is_match(ssn);

    // Using Regex::captures for capturing groups
    let text = "My email is john@example.com";
    let email_pattern = r"([\w\.-]+)@([\w\.-]+)\.(\w+)";
    let re = Regex::new(email_pattern).unwrap();
    let captured_email = re.captures(text);

    // Extracting matched content
    if let Some(captures) = captured_email {
        let email = &captures[0];
    }
}
```
Each of these languages provides its own way to work with Regular Expressions, but the core concepts are similar across the board. You define patterns, match them against text, and extract or manipulate matched content as needed.
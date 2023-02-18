# Proofread PRs
🧹 GitHub Action that automatically spots spelling and grammar mistakes in PRs

## Features
- 🍃 Automatically fixes spelling and grammar mistakes in your PRs (PR review)
- 🤖 AI assisted to provide helpful suggestions and detect subtle errors
- 👎 Can choose to ignore a correction in the future

## Getting Started
```yml
name: Proofread PRs
on: [pull_request]

jobs:
  test:
    permissions: write-all # Required since GitHub now gives actions read-only permissions by default
    runs-on: ubuntu-latest
    name: Proofread PRs
    steps:
      - name: Proofread PR
        uses: @awreck/proofread-action@v1
        id: proofread
        with:
          token: ${{ secrets.GITHUB_TOKEN }} # Required to write a PR review
```

## Limitations
- ❌ Only supports markdown files (will add non-markdown support once #27 gets enough upvotes)
- ❌ Only supports the `en-US` language/locale (will add non-English and en-UK support once #28 gets enough upvotes)
- ❌ Affected by the [LanguageTool API Limitations](https://dev.languagetool.org/public-http-api) (will find a way to get over this once #29 gets enough upvotes)

## How It Works
Proofread PRs uses the [LanguageTool](https://languagetool.org/proofreading-api) API. This is an amazing API services that provides AI-assisted grammar and spelling corrections for free through an *unauthenticated* API endpoint. Go show [them](https://languagetool.org/) some love ❤️
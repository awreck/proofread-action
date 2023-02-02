const core = require('@actions/core')
const github = require('@actions/github')
const axios = require('axios')

const main = async () => {
    try {
        if (!github.context.payload.pull_request) {
            core.setFailed('This action only works on pull requests.')
            return
        }

        const octokit = new github.getOctokit(core.getInput('token'))

        const files = await octokit.rest.pulls.listFiles({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number,
            per_page: 100
        })

        let comments = []

        for (index1 in files.data) {
            const file = files.data[index1]
            const rawFile = await axios.get(file.raw_url)
            const languageCheck = await axios.post('https://api.languagetoolplus.com/v2/check', `text=${encodeURIComponent(rawFile.data)}&language=en-US`, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            })

            for (index2 in languageCheck.data.matches) {
                const match = languageCheck.data.matches[index2]
                const tempstring = rawFile.data.substring(0, match.offset)
                const line = tempstring.split('\n').length

                const comment = {
                    body: `**${match.shortMessage}**\n${match.message}`,
                    path: file.filename,
                    line
                }

                comments.push(comment)
            }
        }

        const existingComments = await octokit.request(`GET /repos/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${github.context.payload.pull_request.number}/comments?per_page=100`, {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number
        })

        let resolved = []
        let nonResolved = []
        let takenCareOf = []
        let reducedComments = []

        for (index1 in existingComments.data) {
            const existingComment = existingComments.data[index1]
            console.log(existingComment)
            if (existingComment.body.toLowerCase().includes('ignore')) {
                resolved.push(existingComment.in_reply_to_id)
                continue
            }

            let shouldResolve = true

            for (index2 in comments) {
                const comment = comments[index2]
                if (comment.body == existingComment.body && comment.path == existingComment.path && comment.line == existingComment.line) {
                    nonResolved.push(existingComment.id)
                    takenCareOf.push(comment)
                    shouldResolve = false
                }
            }

            if (shouldResolve) {
                resolved.push(existingComment.id)
            }
        }

        for (index1 in comments) {
            const comment = comments[index1]
            let skip = false
            for (index2 in takenCareOf) {
                const takenCareOfComment = takenCareOf[index2]
                if (comment.body == takenCareOfComment.body && comment.path == takenCareOfComment.path && comment.line == takenCareOfComment.line) {
                    skip = true
                }
            }
            if (!skip) {
                reducedComments.push(comment)
            }
        }

        for (index1 in resolved) {
            await octokit.rest.pulls.deleteReviewComment({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                comment_id: resolved[index1]
            })
        }
        for (index1 in nonResolved) {
            await octokit.rest.pulls.createReplyForReviewComment({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: github.context.payload.pull_request.number,
                comment_id: nonResolved[index1],
                body: 'Error not resolved 😥'
            })
        }

        console.log(reducedComments, resolved, nonResolved, takenCareOf)

        if (reducedComments.length > 0) {
            await octokit.rest.pulls.createReview({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: github.context.payload.pull_request.number,
                commit_id: github.context.payload.pull_request.head.sha,
                body: '🛑 There are spelling/grammar mistakes in your pull request. Please fix them before merging 🙏',
                event: 'REQUEST_CHANGES',
                reducedComments
            })
        } else {
            await octokit.rest.pulls.createReview({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: github.context.payload.pull_request.number,
                commit_id: github.context.payload.pull_request.head.sha,
                body: 'All good for merge 👍️',
                event: 'APPROVE'
            })
        }
    } catch (error) {
        core.setFailed(error.message)
    }
}

main()

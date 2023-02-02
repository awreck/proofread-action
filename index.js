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
        }).data

        let comments = []

        for (index1 in files) {
            const file = files[index1]
            const rawFile = await axios.get(file.raw_url).data
            const languageCheck = await axios.post('https://api.languagetoolplus.com/v2/check', `text=${encodeURIComponent(rawFile)}&language=en-US`, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            }).data

            for (index2 in languageCheck.matches) {
                const match = languageCheck.matches[index2]
                const tempstring = rawFile.substring(0, match.offset)
                const line = tempstring.split('\n').length

                const comment = {
                    body: `**${match.shortMessage}**\n${match.message}`,
                    path: file.filename,
                    line
                }

                comments.push(comment)
            }
        }

        const commentBodies = []
        const commentPaths = []
        const commentLines = []

        for (index1 in comments) {
            const comment = comments[index1]
            if (commentBodies.includes(comment.body) && commentPaths.includes(comment.path) && commentLines.includes(comment.line)) {
                comment.body = comment.body + '\n**Note: This mistake occurs multiple times in this same line.**'
            } else {
                commentBodies.push(comment.body)
                commentPaths.push(comment.path)
                commentLines.push(comment.line)
            }
        }

        const existingComments = await octokit.rest.pulls.listReviewComments({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number,
            per_page: 100
        }).data

        const reviews = await octokit.rest.pulls.listReviews({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number
        }).data

        console.log(reviews)

        let resolved = []
        let nonResolved = []
        let takenCareOf = []
        let reducedComments = []

        let existingCommentIds = existingComments.map(comment => comment.id)

        if (existingComments) {
            for (index1 in existingComments) {
                const existingComment = existingComments[index1]
                console.log(existingComment)

                let shouldResolve = true

                for (index2 in comments) {
                    const comment = comments[index2]
                    if (comment.body == existingComment.body && comment.path == existingComment.path && comment.line == existingComment.line) {
                        if (existingComment.body.toLowerCase().includes('+ignore') && (existingComment.in_reply_to_id ? existingComments[existingCommentIds.indexOf(existingComment.in_reply_to_id)].user.login == 'github-actions[bot]' : false)) {
                            resolved.push(existingComment.in_reply_to_id)
                            shouldResolve = false
                        } else {
                            nonResolved.push(existingComment.id)
                            shouldResolve = false
                        }
                        takenCareOf.push(comment)
                    }
                }

                if (shouldResolve && existingComment.user.login == 'github-actions[bot]') {
                    resolved.push(existingComment.id)
                }
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

        if (comments.length > 0) {
            let message = ''
            if (resolved.length == 0) {
                message = '🛑 There are spelling/grammar mistakes in your pull request. Please fix them before merging 🙏\n*Pro tip: Reply "+ignore" to any comment to ignore that suggestion!*'
            } else {
                message = '✨ I see you\'ve fixed some of the mistakes in your pull request! Please fix the others before merging 🙏\n*Pro tip: Reply "+ignore" to any comment to ignore that suggestion!*'
            }

            await octokit.rest.pulls.createReview({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: github.context.payload.pull_request.number,
                commit_id: github.context.payload.pull_request.head.sha,
                body: message,
                event: 'REQUEST_CHANGES',
                comments: reducedComments
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

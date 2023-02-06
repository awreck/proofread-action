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

        const { data: files } = await octokit.rest.pulls.listFiles({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number,
            per_page: 100
        })

        let comments = []

        for (index1 in files) {
            const file = files[index1]
            const { data: rawFile } = await axios.get(file.raw_url)
            const { data: languageCheck } = await axios.post('https://api.languagetoolplus.com/v2/check', `text=${encodeURIComponent(rawFile)}&language=en-US`, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            })

            for (index2 in languageCheck.matches) {
                const match = languageCheck.matches[index2]
                const tempstring = rawFile.substring(0, match.offset)
                const line = tempstring.split('\n').length
                const stringReplacements = []

                for (index1 in match.replacements) {
                    stringReplacements.push(match.replacements[index1].value)
                }

                const comment = {
                    body: `**${match.shortMessage}**\n${match.message}\n\n**Context:** ${match.context.text}${stringReplacements ? `\n\n**Suggested replacements:** ${stringReplacements.join(', ')}` : ''}`,
                    path: file.filename,
                    line
                }

                comments.push(comment)
            }
        }

        const commentBodies = []
        const commentPaths = []
        const commentLines = []
        const tempComments = []

        for (index1 in comments) {
            const comment = comments[index1]
            if (commentBodies.includes(comment.body) && commentPaths.includes(comment.path) && commentLines.includes(comment.line)) {
                for (index2 in tempComments) {
                    const tempComment = tempComments[index2]
                    if (tempComment.body == comment.body && tempComment.path == comment.path && tempComment.line == comment.line) {
                        tempComment.body = tempComment.body + '\n\n**Note: This mistake occurs multiple times in this same line.**'
                    }
                }
            } else {
                commentBodies.push(comment.body)
                commentPaths.push(comment.path)
                commentLines.push(comment.line)
                tempComments.push(comment)
            }
        }

        comments = tempComments

        const { data: existingComments } = await octokit.rest.pulls.listReviewComments({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number,
            per_page: 100
        })

        const { data: reviews } = await octokit.rest.pulls.listReviews({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: github.context.payload.pull_request.number
        })

        const resolved = []
        const nonResolved = []
        const takenCareOf = []
        const reducedComments = []

        if (existingComments) {
            for (index1 in existingComments) {
                const existingComment = existingComments[index1]
                console.log('id', existingComment.id)
                console.log('body', existingComment.body)
                let shouldResolve = true

                if (existingComment.reactions['-1'] > 0 && existingComment.user.login == 'github-actions[bot]') {
                    await octokit.rest.pulls.createReplyForReviewComment({
                        owner: github.context.repo.owner,
                        repo: github.context.repo.repo,
                        pull_number: github.context.payload.pull_request.number,
                        comment_id: existingComment.id,
                        body: 'Will ignore this mistake in the future 👍️'
                    })
                    console.log('reaction id', existingComment.id)
                    console.log('reaction body', existingComment.body)
                    shouldResolve = false
                    for (index2 in comments) {
                        const comment = comments[index2]
                        if (comment.body == existingComment.body && comment.path == existingComment.path && (existingComment.line ? comment.line == existingComment.line : true)) {
                            takenCareOf.push(comment)
                            console.log('reaction takencare id', existingComment.id)
                            console.log('reaction takencare body', existingComment.body)
                        }
                    }
                    continue
                }

                for (index2 in comments) {
                    const comment = comments[index2]
                    if (comment.body == existingComment.body && comment.path == existingComment.path && (existingComment.line ? comment.line == existingComment.line : true)) {
                        nonResolved.push(existingComment.id)
                        shouldResolve = false
                        takenCareOf.push(comment)
                        console.log('nonresolved id', existingComment.id)
                        console.log('nonresolved body', existingComment.body)
                    }
                }

                if (shouldResolve && existingComment.user.login == 'github-actions[bot]') {
                    console.log('resolved id', existingComment.id)
                    console.log('resolved body', existingComment.body)
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

        console.log(comments, reducedComments, resolved, nonResolved, takenCareOf)

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

        if (comments.length > 0) {
            let message = ''
            if (resolved.length == 0) {
                message = '🛑 There are spelling/grammar mistakes in your pull request. Please fix them before merging 🙏\n*Pro tip: React with 👎️ to any comment to hide that suggestion in the future!*'
            } else {
                message = '✨ I see you\'ve fixed some of the mistakes in your pull request! Please fix the others before merging 🙏\n*Pro tip: React with 👎️ to any comment to hide that suggestion in the future!*'
            }

            const review = await octokit.rest.pulls.createReview({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: github.context.payload.pull_request.number,
                commit_id: github.context.payload.pull_request.head.sha,
                body: message,
                event: 'REQUEST_CHANGES',
                comments: reducedComments
            })
        } else if (comments.length !== nonResolved.length) {
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
        core.setFailed(error.message + ' ' + error.stack)
    }
}

main()

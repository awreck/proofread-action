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
            const rawFile = await axios.get(files.data[index1].raw_url)
            const languageCheck = await axios.post('https://api.languagetoolplus.com/v2/check', `text=${encodeURIComponent(rawFile.data)}&language=en-US`, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            })

            for (index2 in languageCheck.data.matches) {
                const tempstring = rawFile.data.substring(0, languageCheck.data.matches[index2].offset)
                const line = tempstring.split('\n').length

                const comment = {
                    body: `**${languageCheck.data.matches[index2].shortMessage}**\n${languageCheck.data.matches[index2].message}`,
                    path: files.data[index1].filename,
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

        for (index1 in existingComments.data) {
            console.log(existingComments.data[index1])
            if (existingComments.data[index1].body.toLowerCase().includes('ignore')) {
                resolved.push(existingComments.data[index1].in_reply_to_id)
                continue
            }

            let skip = false

            for (index2 in comments) {
                if (comments[index2].body == existingComments.data[index1].body && comments[index2].path == existingComments.data[index1].path && comments[index2].line == existingComments.data[index1].line) {
                    nonResolved.push(existingComments.data[index1].id)
                    takenCareOf.push(comments[index2])
                    skip = true
                    break
                }
            }

            if (!skip) {
                resolved.push(existingComments.data[index1])
            }
        }

        let reducedComments = []

        for (index1 in comments) {
            let skip = false
            for (index2 in takenCareOf) {
                if (comments[index1].body == takenCareOf[index2].body && comments[index1].path == takenCareOf[index2].path && comments[index1].line == takenCareOf[index2].line) {
                    skip = true
                    break
                }
            }
            if (!skip) {
                reducedComments.push(comments[index1])
            }
        }

        for (index1 in resolved) {
            await octokit.rest.pulls.deleteReviewComment({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                comment_id: resolved[index1].id
            })
        }
        for (index1 in nonResolved) {
            await octokit.rest.pulls.createReplyForReviewComment({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: github.context.payload.pull_request.number,
                comment_id: nonResolved[index1].id,
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
            core.setFailed('There are spelling/grammar mistakes in your pull request.')
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

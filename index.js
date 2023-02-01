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
            pull_number: github.context.payload.pull_request.number
        })

        let comments = []

        for (index1 in files.data) {
            const rawFile = await axios.get(files.data[index1].raw_url)
            console.log(rawFile.data)

            const languageCheck = await axios.post('https://api.languagetoolplus.com/v2/check', `text=${encodeURIComponent(rawFile.data)}&language=en-US`, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            })

            console.log(languageCheck.data)

            for (index2 in languageCheck.data.matches) {
                const tempstring = rawFile.data.substring(0, languageCheck.data.matches[index2].offset)
                const line = tempstring.split('\n').length

                const comment = {
                    body: `**${languageCheck.data.matches[index2].shortMessage}**\n${languageCheck.data.matches[index2].message}`,
                    path: files.data[index1].filename,
                    line
                }

                comments.push(comment)

                console.log(comment)
            }

            if (languageCheck.data.matches.length > 0) {
                octokit.rest.pulls.createReview({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    pull_number: github.context.payload.pull_request.number,
                    commit_id: github.context.payload.pull_request.head.sha,
                    body: '🛑 There are spelling/grammar mistakes in your pull request. Please fix them before merging 🙏',
                    event: 'REQUEST_CHANGES',
                    comments
                })
                core.setFailed('There are spelling/grammar mistakes in your pull request.')
            } else {
                octokit.rest.pulls.createReview({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    pull_number: github.context.payload.pull_request.number,
                    commit_id: github.context.payload.pull_request.head.sha,
                    body: 'All good for merge 👍️',
                    event: 'APPROVE'
                })
            }
        }
    } catch (error) {
        core.setFailed(error.message)
    }
}

main()

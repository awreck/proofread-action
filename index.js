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

        for (index1 in files.data) {
            const rawFile = await axios.get(files.data[index1].raw_url)
            console.log(rawFile.data)

            const formData = new FormData()
            
            formData.append('text', rawFile.data)
            formData.append('language', 'en-US')

            const languageCheck = await axios.post('https://api.languagetoolplus.com/v2/check', formData)

            for (index2 in languageCheck.data.matches) {
                const tempstring = rawFile.data.substring(0, languageCheck.data.matches[index2].offset)
                const line = tempstring.split('\n').length

                await octokit.rest.pulls.createReviewComment({
                    user: github.context.repo.user,
                    repo: github.context.repo.repo,
                    pull_number: github.context.payload.pull_request.number,
                    body: `**${languageCheck.data.matches[index2].shortMessage}**
                    ${languageCheck.data.matches[index2].message}`,
                    commit_id: github.context.payload.pull_request.head.sha,
                    path: files[index1].filename,
                    line
                })
            }
        }
    } catch (error) {
        core.setFailed(error)
    }
}

main()

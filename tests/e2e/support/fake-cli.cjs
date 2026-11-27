// Runs as a real child process through the production Claude/Codex adapters.
const fs = require('node:fs')
const args = process.argv.slice(2)
if (args.includes('--version')) {
  console.log('E2E CLI 1.0.0')
} else if (args.includes('auth')) {
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'subscription' }))
} else if (args.includes('login')) {
  console.log('Logged in using ChatGPT')
} else if (args.includes('debug')) {
  console.log(JSON.stringify({ models: [{ slug: 'e2e-model', display_name: 'E2E Model', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] }] }))
} else {
  let prompt = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { prompt += chunk })
  process.stdin.on('end', () => {
    const tasks = [
      ['refinePlan', 'Revise the existing study plan'],
      ['plan', 'Create a personalized programming study plan'],
      ['lesson', 'Prepare one short lesson.'],
      ['gradeOpen', "Grade the learner's answer"],
      ['reviewCode', "Review the learner's solution"],
      ['trace', 'Prepare an interactive trace'],
      ['explain', 'Explain step by step why'],
      ['chat', "Answer the learner's follow-up"],
      ['ping', 'Connection test.'],
    ]
    const task = tasks.find(([, marker]) => prompt.includes(marker))?.[0]
    const response = JSON.parse(fs.readFileSync(process.env.E2E_RESPONSES, 'utf8'))[task]
    fs.appendFileSync(process.env.E2E_CALLS, JSON.stringify({ task, args }) + '\n')
    if (!response) throw new Error(`Missing E2E response for ${task}`)
    if (response.error) {
      console.log(JSON.stringify({ type: 'result', is_error: true, result: response.error }))
      process.exitCode = 1
      return
    }
    if (args.includes('-o')) {
      fs.writeFileSync(args[args.indexOf('-o') + 1], typeof response.data === 'string' ? response.data : JSON.stringify(response.data))
      console.log('E2E response complete')
    } else {
      const data = response.data
      console.log(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: JSON.stringify(data) } } }))
      console.log(JSON.stringify({ type: 'result', structured_output: data, result: typeof data === 'string' ? data : JSON.stringify(data) }))
    }
  })
}

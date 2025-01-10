import { exec } from 'child_process'
import fs from 'fs'
import os from 'os'
import { promisify } from 'util'
import { environmentVariables, exceptionHandler, fileExists, networkUtils, webhookSecretsUtils, WorkerSystemProp } from '@activepieces/server-shared'
import { assertNotNullOrUndefined, isNil, MachineInformation, spreadIfDefined, WorkerMachineHealthcheckRequest, WorkerMachineHealthcheckResponse } from '@activepieces/shared'

const execAsync = promisify(exec)


let settings: WorkerMachineHealthcheckResponse | undefined


export const workerMachine = {
    getSystemInfo,
    init: async (_settings: WorkerMachineHealthcheckResponse) => {
        settings = {
            ..._settings,
            ...spreadIfDefined('FLOW_WORKER_CONCURRENCY', environmentVariables.getNumberEnvironment(WorkerSystemProp.FLOW_WORKER_CONCURRENCY)),
            ...spreadIfDefined('SCHEDULED_WORKER_CONCURRENCY', environmentVariables.getNumberEnvironment(WorkerSystemProp.SCHEDULED_WORKER_CONCURRENCY)),
        }

        await webhookSecretsUtils.init(settings.APP_WEBHOOK_SECRETS)
        exceptionHandler.initializeSentry(settings.SENTRY_DSN)
    },
    getSettings: () => {
        assertNotNullOrUndefined(settings, 'Settings are not set')
        return settings
    },
    getInternalApiUrl: (): string => {
        if (environmentVariables.hasAppModules()) {
            return 'http://127.0.0.1:3000/'
        }
        return getInternalUrl()
    },
    getPublicApiUrl: (): string => {
        return networkUtils.combineUrl(workerMachine.getPublicUrl(), 'api')
    },
    getPublicUrl: () => {
        if (isNil(settings)) {
            return getInternalUrl()
        }
        return cleanTrailingSlash(settings.PUBLIC_URL)
    },
}

const appendSlashAndApi = (url: string): string => {
    const slash = url.endsWith('/') ? '' : '/'
    return `${url}${slash}api/`
}


function getInternalUrl(): string {
    const url = environmentVariables.getEnvironmentOrThrow(WorkerSystemProp.FRONTEND_URL)
    return appendSlashAndApi(url)
}
function cleanTrailingSlash(url: string) {
    if (url.endsWith('/')) {
        return url.slice(0, -1)
    }
    return url
}

async function getSystemInfo(): Promise<WorkerMachineHealthcheckRequest> {
    const { totalRamInBytes, ramUsage } = await getContainerMemoryUsage()

    const cpus = os.cpus()
    const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
        const idle = cpu.times.idle
        return acc + (1 - idle / total)
    }, 0) / cpus.length * 100

    const ip = (await networkUtils.getPublicIp()).ip
    const diskInfo = await getDiskInfo()

    return {
        diskInfo,
        cpuUsagePercentage: cpuUsage,
        ramUsagePercentage: ramUsage,
        totalAvailableRamInBytes: totalRamInBytes,
        ip,
        workerProps: {},
    }
}
async function getContainerMemoryUsage() {
    const memLimitPath = '/sys/fs/cgroup/memory/memory.limit_in_bytes'
    const memUsagePath = '/sys/fs/cgroup/memory/memory.usage_in_bytes'

    const memLimitExists = await fileExists(memLimitPath)
    const memUsageExists = await fileExists(memUsagePath)


    const totalRamInBytes = memLimitExists ? parseInt(await fs.promises.readFile(memLimitPath, 'utf8')) : os.totalmem()
    const usedRamInBytes = memUsageExists ? parseInt(await fs.promises.readFile(memUsagePath, 'utf8')) : os.totalmem() - os.freemem()

    return {
        totalRamInBytes,
        ramUsage: (usedRamInBytes / totalRamInBytes) * 100,
    }
}

async function getDiskInfo(): Promise<MachineInformation['diskInfo']> {
    const platform = os.platform()

    try {
        if (platform === 'win32') {
            const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption')
            const lines = stdout.trim().split('\n').slice(1)
            let total = 0, free = 0

            for (const line of lines) {
                const [, freeSpace, size] = line.trim().split(/\s+/)
                if (freeSpace && size) {
                    total += parseInt(size)
                    free += parseInt(freeSpace)
                }
            }

            const used = total - free
            return {
                total,
                free,
                used,
                percentage: (used / total) * 100,
            }
        }
        else {
            const { stdout } = await execAsync('df -k / | tail -1')
            const [, blocks, used, available] = stdout.trim().split(/\s+/)

            const totalBytes = parseInt(blocks) * 1024
            const usedBytes = parseInt(used) * 1024
            const freeBytes = parseInt(available) * 1024

            return {
                total: totalBytes,
                free: freeBytes,
                used: usedBytes,
                percentage: (usedBytes / totalBytes) * 100,
            }
        }
    }
    catch (error) {
        return {
            total: 0,
            free: 0,
            used: 0,
            percentage: 0,
        }
    }
}

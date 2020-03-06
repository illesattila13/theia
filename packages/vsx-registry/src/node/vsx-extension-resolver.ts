/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import * as decompress from 'decompress';
import * as filenamify from 'filenamify';
import * as requestretry from 'requestretry';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { PluginDeployerResolver, PluginDeployerResolverContext } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { VSXExtensionUri } from '../common/vsx-extension-uri';
import { VSXRegistryAPI } from '../common/vsx-registry-api';
import { VSXEnvironment } from '../common/vsx-environment';

@injectable()
export class VSXExtensionResolver implements PluginDeployerResolver {

    @inject(VSXRegistryAPI)
    protected readonly api: VSXRegistryAPI;

    @inject(VSXEnvironment)
    protected readonly environment: VSXEnvironment;

    accept(pluginId: string): boolean {
        return !!VSXExtensionUri.toId(new URI(pluginId));
    }

    async resolve(context: PluginDeployerResolverContext): Promise<void> {
        const id = VSXExtensionUri.toId(new URI(context.getOriginId()));
        if (!id) {
            return;
        }
        let downloadUrl;
        let fullPluginName;
        console.log(`[${id}]: trying to resolve latest version...`);
        try {
            const extension = await this.api.getExtension(id);
            fullPluginName = id + '-' + extension.version;
            downloadUrl = extension.downloadUrl;
        } catch (e) {
            console.error(`[${id}]: failed to resolve, reason:`, e);
            return;
        }
        console.log(`[${id}]: resolved to '${fullPluginName}'`);

        const extensionsDirUri = await this.environment.getExtensionsDirUri();
        await fs.ensureDir(FileUri.fsPath(extensionsDirUri));

        const extensionPath = FileUri.fsPath(extensionsDirUri.resolve(filenamify(fullPluginName)));
        if (await fs.pathExists(extensionPath)) {
            console.log(`[${fullPluginName}]: already found in "${extensionPath}"`);
            context.addPlugin(fullPluginName, extensionPath);
            return;
        }

        const downloadPath = FileUri.fsPath(extensionsDirUri.resolve(uuidv4()));
        console.log(`[${fullPluginName}]: trying to download from "${downloadUrl}"...`);
        try {
            if (!await this.download(downloadUrl, downloadPath)) {
                console.log(`[${fullPluginName}]: not found`);
                return;
            }
        } catch (e) {
            console.error(`[${fullPluginName}]: failed to download, reason:`, e);
            return;
        }
        console.log(`[${fullPluginName}]: downloaded to "${downloadPath}"`);

        console.log(`[${fullPluginName}]: trying to decompress to "${extensionPath}"...`);
        try {
            await decompress(downloadPath, extensionPath);
        } catch (e) {
            console.error(`[${fullPluginName}]: failed to decompress, reason:`, e);
            return;
        } finally {
            await fs.remove(downloadPath);
        }

        console.log(`[${fullPluginName}]: decompress to "${extensionPath}"`);
        context.addPlugin(fullPluginName, extensionPath);
    }

    protected async download(downloadUrl: string, downloadPath: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            requestretry(downloadUrl, {
                method: 'GET',
                maxAttempts: 5,
                retryDelay: 2000,
                retryStrategy: requestretry.RetryStrategies.HTTPOrNetworkError
            }, (err, response) => {
                if (err) {
                    reject(err);
                } else if (response && response.statusCode === 404) {
                    resolve(false);
                } else if (response && response.statusCode !== 200) {
                    reject(new Error(response.statusMessage));
                }
            }).pipe(fs.createWriteStream(downloadPath))
                .on('error', reject)
                .on('close', () => resolve(true));
        });
    }
}

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

import { inject, injectable } from 'inversify';
import { CommandRegistry, MenuModelRegistry, DisposableCollection, MessageService } from '@theia/core/lib/common';
import { FrontendApplicationContribution, CommonMenus } from '@theia/core/lib/browser';

@injectable()
export class SampleMainMenuUpdater implements FrontendApplicationContribution {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly toDisposeBeforeMenuUpdate = new DisposableCollection();

    onStart(): void {
        const command = { id: 'dynamically-update-main-menu', label: 'Dynamically update the main menu' };
        this.commandRegistry.registerCommand(command, {
            execute: () => {
                this.toDisposeBeforeMenuUpdate.dispose();
                const dynamicGroupMenuPath = [...CommonMenus.HELP, 'z_dynamic_group'];
                const infoDateMenuPath = [...dynamicGroupMenuPath, 'z_show_date_group'];
                const date = new Date().toISOString();
                this.toDisposeBeforeMenuUpdate.pushAll([
                    this.menuRegistry.registerSubmenu(infoDateMenuPath, 'Dynamic Date'),
                    this.commandRegistry.registerCommand({ id: date }, { execute: () => this.messageService.info(date) }),
                    this.commandRegistry.registerCommand({ id: date.split('').reverse().join('') }, { execute: () => this.messageService.info(date.split('').reverse().join('')) }),
                    this.menuRegistry.registerMenuAction(infoDateMenuPath, { commandId: date }),
                    this.menuRegistry.registerMenuAction(infoDateMenuPath, { commandId: date.split('').reverse().join('') })
                ]);
            }
        });
        this.commandRegistry.executeCommand(command.id);
    }

}

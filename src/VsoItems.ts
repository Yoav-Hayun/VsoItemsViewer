import * as vscode from 'vscode';
import * as azdev from "azure-devops-node-api";
import * as path from 'path';

import { Settings, InputBoxOptions, VsoItemFields, TypeIcons } from './configurations';

/**
 * This class represents a single VSO Item
 */
export class VsoItem extends vscode.TreeItem {
    private title: string = "";
    private type: string | undefined;
    private state: string | undefined;
    private link: string | undefined;

    private isConnected:boolean = false;

    constructor
    (
        public readonly vsoId: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        vsoItemProvider: VsoItemsProvider,
    ) 
    {
        super(vsoId.toString(), collapsibleState);
        this.refresh(vsoItemProvider);
    }

    public refresh(vsoItemProvider: VsoItemsProvider){
        if(vsoItemProvider.Connection){
            if (this.title === ''){
                this.title = '...';
                vsoItemProvider.refreshUI();
            }
            vsoItemProvider.Connection.getWorkItemTrackingApi().then(api => {
                this.isConnected = true;
                api.getWorkItem(this.vsoId, [VsoItemFields.Title, VsoItemFields.Type, VsoItemFields.State]).then(workitem => {
                    if (!workitem){
                        this.title = "[Unknown] VSO Item";
                    } else if (workitem.fields){
                        this.title = workitem.fields[VsoItemFields.Title];
                        this.type = workitem.fields[VsoItemFields.Type];
                        this.state = workitem.fields[VsoItemFields.State];
                        this.link = workitem._links.html.href;
                    }
                    vsoItemProvider.refreshUI();
                });
            });
        } else {
            this.isConnected = false;
        }
    }

    get tooltip(): string {
        return `${this.vsoId}: ${this.title}`;
    }

    get description(): string {
        return this.state? `[${this.state}] ${this.title}` : this.title;
    }

    get iconPath() {
        return this.type && TypeIcons[this.type] && path.join(__filename, '..', '..', 'resources', TypeIcons[this.type]);
    }

    public open(){
        if (this.link){
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(this.link));
        } else if (!this.isConnected){
            vscode.window.showErrorMessage("VSO Items: Connection is not active. Click the refresh button to reconnect.");
        }
    }
}

/**
 * This class represents the list of VsoItem objects that will be displayed to the user
 */
export class VsoItemsProvider implements vscode.TreeDataProvider<VsoItem> {

    private az: Azure;
    private isConnecting: boolean = false;

    private vsoItemsCache: {[id: number]: VsoItem} = {};

    constructor(){
        this.az = new Azure();
    }

    public async initialize(){
        await this.az.connect();
    }
    
    private _onDidChangeTreeData: vscode.EventEmitter<VsoItem | undefined | null> = new vscode.EventEmitter<VsoItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<VsoItem | undefined | null> = this._onDidChangeTreeData.event;

    getTreeItem(element: VsoItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: VsoItem): Thenable<VsoItem[]> {
        if (vscode.window.activeTextEditor?.document){
            return Promise.resolve(this.getVsoItemsInFile(vscode.window.activeTextEditor.document));
        }
        return Promise.resolve([]);
    }

    private getVsoItemsInFile(file: vscode.TextDocument): VsoItem[]{
        let re = /VSO[\W_]*([0-9]+)/gi;
        let result:VsoItem[] = [];
        let pushed:number[] = [];

        const text = file.getText();
        var match;
        while ( (match = re.exec( text )) !== null ) {
            const id = Number(match[1]);
            if (pushed.indexOf(id) < 0){
                result.push(this.getVsoItem(id));
                pushed.push(id);
            }
        }
        return result?? [];
    }
    
    public refresh(attemptToConnect:boolean = false): void {
        if(attemptToConnect && !this.isConnecting){
            this.Connect(true /* promptForRequiredSettings */);
        }
        for (const id in this.vsoItemsCache){
            this.vsoItemsCache[id].refresh(this);
        }
        this.refreshUI();
    }
    
    public refreshUI(){
        this._onDidChangeTreeData.fire(null);
    }

    get Connection() : azdev.WebApi | undefined{
        if(this.Connect()){
            return this.az.Connection;
        }
    }

    private Connect(promptForRequiredSettings:boolean=false) : boolean {
        if (this.az.Connection){
            return true;
        }
        this.isConnecting = true;
        this.az.connect(promptForRequiredSettings).then(success => {
            this.isConnecting = false;
            if(success){
                this.refresh();
            }
        });
        return false;
    }

    private getVsoItem(id: number): VsoItem{
        if (!this.vsoItemsCache[id]){
            this.vsoItemsCache[id] = new VsoItem(id, vscode.TreeItemCollapsibleState.None, this);
        }
        return this.vsoItemsCache[id];
    }
}

/**
 * This class represents the connection with Azure DevOps in order to fetch information on VsoItem objects
 */
class Azure {
    private accessToken: string | undefined;
    private organizationUrl: string | undefined;

    private connection: azdev.WebApi | undefined;
    private isConnected: boolean = false;
    private isConnecting: boolean = false;
    private lastConnectionAttemptString: string | undefined;
    
    public async connect(promptForRequiredSettings:boolean=false) : Promise<boolean>{
        if(!this.isConnecting)
        {
            try
            {
                this.isConnecting = true;
                if (this.isConnected){
                    return Promise.resolve(true);
                }
                if (this.organizationUrl = await this.getSettingValue(Settings.AzureOrganizationUrl, InputBoxOptions.AzureOrganizationUrl, promptForRequiredSettings)){
                    this.accessToken = await this.getSettingValue(Settings.AzureAccessToken, InputBoxOptions.AzureAccessToken, promptForRequiredSettings);
                }
                await this._connect(this.organizationUrl, this.accessToken);
            }
            finally
            {
                this.isConnecting = false;
            }
        }
        return Promise.resolve(this.isConnected);
    }

    get Connection() : azdev.WebApi | undefined { return this.isConnected ? this.connection : undefined;}

    private async _connect(organizationUrl: string | undefined, accessToken: string | undefined){
        if (accessToken && organizationUrl){
            this.connection = new azdev.WebApi(organizationUrl, azdev.getPersonalAccessTokenHandler(accessToken));
            this.connection.connect()
            .then( _ => {
                this.isConnected = true; 
                }
            )
            .catch( _ => {
                this.isConnected = false;
                this.onNewConnectionCredentials(organizationUrl, accessToken, 
                    () =>vscode.window.showErrorMessage("VSO Items: Failed to connect to Azure DevOps. Please check your Azure organization URL and access token in settings."));
                }
            );
        } else {
            this.isConnected = false;
            this.onNewConnectionCredentials(organizationUrl, accessToken, 
                () => vscode.window.showInformationMessage("VSO Items: Please provide an Azure organization URL and access token in settings"));
        }
    }

    private async onNewConnectionCredentials(organizationUrl: string | undefined, accessToken: string | undefined, action : () => void ) {
        const connectionAttemptString = `${organizationUrl}-${accessToken}`;
        if (!this.lastConnectionAttemptString || this.lastConnectionAttemptString !== connectionAttemptString){
            this.lastConnectionAttemptString = connectionAttemptString;
            action();
        }
    }

    private async getSettingValue(settingId: string, inputBoxOptions: vscode.InputBoxOptions, promptForRequiredSettings:boolean=false){
        return vscode.workspace.getConfiguration().get<string>(settingId) || 
                                            (promptForRequiredSettings ? await this.promptForSettingValue(settingId, inputBoxOptions) : undefined);
    }

    private async promptForSettingValue(settingId: string, inputBoxOptions: vscode.InputBoxOptions){
        const value = await vscode.window.showInputBox(inputBoxOptions);
        if(value){
            vscode.workspace.getConfiguration().update(settingId, value, true);
            return value;
        }
    }
}
import * as vscode from 'vscode';
import * as azdev from "azure-devops-node-api";
import * as path from 'path';

const typeIcons: {[type: string] : string} = {
    'Bug' : 'icon_bug.svg',
    'Task': 'icon_task.svg',
    'Task Group': 'icon_task_group.svg',
    'Product Backlog Item': 'icon_backlog_item.svg',
    'Feature': 'icon_feature.svg',
    'Initiative': 'icon_initiative.svg',
    'User Story' : 'icon_user_story.svg'
};

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
            this.isConnecting = true;
            try
            {
                if (this.isConnected){
                    return Promise.resolve(true);
                }
                this.organizationUrl = vscode.workspace.getConfiguration().get<string>('vsoitems.OrganizationUrl') || 
                                            (promptForRequiredSettings ? await this.updateOrganizationUrl() : undefined);
                if (this.organizationUrl){
                    this.accessToken = vscode.workspace.getConfiguration().get<string>('vsoitems.AzureAccessToken') || 
                                            (promptForRequiredSettings ? await this.updateAccessToken() : undefined);
                }
                const connectionAttemptString = `${this.organizationUrl}-${this.accessToken}`;
                if (this.accessToken && this.organizationUrl){
                    let authHandler = azdev.getPersonalAccessTokenHandler(this.accessToken); 
                    this.connection = new azdev.WebApi(this.organizationUrl, authHandler);
                    const connectionData = this.connection.connect(); 
                    await connectionData.then(_ => {
                        this.isConnected = true;
                    }).catch(_ => {
                        if (!this.lastConnectionAttemptString || this.lastConnectionAttemptString !== connectionAttemptString){
                            this.lastConnectionAttemptString = connectionAttemptString;
                            vscode.window.showErrorMessage("VSO Items: Failed to connect to Azure DevOps. Please Check your organization URL and access token in settings.");
                        }
                        this.isConnected = false;
                    });
                } else {
                    if (!this.lastConnectionAttemptString || this.lastConnectionAttemptString !== connectionAttemptString){
                        this.lastConnectionAttemptString = connectionAttemptString;
                        vscode.window.showInformationMessage("VSO Items: Please provide an Azure organization URL and access token in settings");
                        this.isConnected = false;
                    }
                }
                return Promise.resolve(this.isConnected);
            }
            finally
            {
                this.isConnecting = false;
            }
        }
        return Promise.resolve(false);
    }

    get Connection() : azdev.WebApi | undefined { return this.isConnected ? this.connection : undefined;}

    private async updateOrganizationUrl(){
        let organizationUrlPrefix: string = "https://dev.azure.com/";
        let organizationUrlSuffix: string = "{organization}";
        const value = await vscode.window.showInputBox({
            value: organizationUrlPrefix + organizationUrlSuffix,
            valueSelection: [organizationUrlPrefix.length, -1],
            prompt: "Organization URL"
        });
        if(value){
            vscode.workspace.getConfiguration().update('vsoitems.OrganizationUrl', value, true);
            return value;
        }
    }

    private async updateAccessToken(){
        let explanationLink: string = "https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate";
        const value = await vscode.window.showInputBox({
            prompt: "Access Token. [ " + explanationLink + " ]"
        });
        if(value){
            vscode.workspace.getConfiguration().update('vsoitems.AzureAccessToken', value, true);
            return value;
        }
    }
}

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
                api.getWorkItem(this.vsoId, ['System.Title', 'System.WorkItemType', 'System.State']).then(workitem => {
                    if (!workitem){
                        this.title = "[Unknown] VSO Item";
                    } else if (workitem.fields){
                        this.title = workitem.fields['System.Title'];
                        this.type = workitem.fields['System.WorkItemType'];
                        this.state = workitem.fields['System.State'];
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
        return this.type && typeIcons[this.type] && path.join(__filename, '..', '..', 'resources', typeIcons[this.type]);
    }

    public open(){
        if (this.link){
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(this.link));
        } else if (!this.isConnected){
            vscode.window.showErrorMessage("VSO Items: Connection is not active. Click the refresh button to reconnect.");
        }
    }
}
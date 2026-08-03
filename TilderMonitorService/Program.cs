using Microsoft.Extensions.Hosting.WindowsServices;

namespace TilderMonitorService;

public class Program
{
    public static void Main(string[] args)
    {
        Directory.SetCurrentDirectory(AppContext.BaseDirectory);
        var builder = Host.CreateApplicationBuilder(args);
        
        // Ensure the service can run as a Windows Service
        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "TilderMonitorService";
        });
        
        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();
        host.Run();
    }
}
